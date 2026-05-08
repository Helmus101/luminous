import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 1. HELPERS
async function getUserIdByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  
  if (data) return data.id;
  
  const { data: newUser } = await supabase
    .from('users')
    .insert({ email })
    .select('id')
    .single();
    
  return newUser?.id;
}

export async function findPersonByName(name) {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .ilike('name', `%${name}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

function safeArray(value) {
  return [...new Set(value.filter(Boolean).map(item => String(item).trim()).filter(Boolean))];
}

function inferUserContext(messages = []) {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content || '');
  const joined = userMessages.join('\n');
  
  let likelyName = null;
  let studentType = 'unknown';
  let university = null;
  let linkedInUrl = null;

  // Attempt to extract based on conversation goals
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && m.payload?.goal) {
      const goal = m.payload.goal;
      const nextMsg = messages[i + 1];
      if (nextMsg && nextMsg.role === 'user') {
        const val = nextMsg.content;
        if (goal === 'name' && val.length < 50) likelyName = val;
        if (goal === 'student_type') {
          if (val.toLowerCase().includes('high school')) studentType = 'high_school_student';
          else if (val.toLowerCase().includes('university') || val.toLowerCase().includes('college')) studentType = 'university_student';
        }
        if (goal === 'uni_context') university = val;
        if (goal === 'uni_linkedin' && val.includes('linkedin.com')) linkedInUrl = val;
      }
    }
  }

  // Fallback / legacy extraction
  if (!likelyName) {
    const firstUserMessage = userMessages[0]?.trim() || '';
    likelyName = firstUserMessage.length <= 42
      && !/[?]/.test(firstUserMessage)
      && !/\b(i am|i'm|looking|find|mentor|student|university|college|high school|linkedin)\b/i.test(firstUserMessage)
        ? firstUserMessage.replace(/^my name is\s+/i, '').trim()
        : null;
  }

  if (studentType === 'unknown') {
    const isUniversityStudent = /\b(university student|college student|freshman|sophomore|junior|senior|undergrad|undergraduate|i go to|i study at|my university|my college)\b/i.test(joined);
    const isHighSchoolStudent = /\b(high school|secondary school|applying|prospective|college applications|university applications)\b/i.test(joined);
    studentType = isUniversityStudent ? 'university_student' : isHighSchoolStudent ? 'high_school_student' : 'unknown';
  }

  if (!university) {
    const universityMatch = joined.match(/\b(at|to|from|school:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    university = universityMatch ? universityMatch[2] : null;
  }
  
  return {
    likelyName,
    studentType,
    university,
    linkedinUrl: linkedInUrl,
    interests: [],
    goals: [],
    industries: [],
    campusSignals: {},
    rawContext: joined.slice(-2000),
  };
}

export async function syncUserContextToPeople(email, messages = []) {
  if (!email) return;
  const userId = await getUserIdByEmail(email);
  if (!userId) return;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  const context = inferUserContext(messages);
  const displayName = user?.full_name || user?.first_name || context.likelyName || email.split('@')[0];

  await supabase
    .from('people')
    .upsert({
      external_key: userId,
      name: displayName,
      contact_email: email,
      linkedin_url: context.linkedinUrl,
      background: context.university ? `Student at ${context.university}` : 'Member of the Luminous community',
      current_role_text: context.studentType === 'university_student' ? 'University Student' : context.studentType === 'high_school_student' ? 'High School Student' : 'Member',
      profile_json: {
        studentType: context.studentType,
        university: context.university,
        lastSyncedAt: new Date().toISOString(),
      },
    }, { onConflict: 'external_key' });
}

export async function ensureUserPerson(email) {
  return syncUserContextToPeople(email, []);
}

export async function saveWaitlistLead({ email, studentType, source, initial_query }) {
  const { data, error } = await supabase.from('waitlist').insert({ 
    email, 
    student_type: studentType, 
    source, 
    initial_query 
  });
  if (error) {
    console.error('Error saving waitlist lead:', error);
    throw error;
  }
  return data;
}

export async function saveChatTranscript(email, messages) {
  if (!email) return;
  await syncUserContextToPeople(email, messages);
  
  await supabase
    .from('chat_sessions')
    .upsert({
      email,
      messages,
      updated_at: new Date().toISOString()
    }, { onConflict: 'email' });
}

export async function getLatestChatSession(email) {
  const { data } = await supabase
    .from('chat_sessions')
    .select('messages')
    .eq('email', email)
    .maybeSingle();
  return data || { messages: [] };
}

export async function getIntroCountThisMonth(email) {
  return 0; // Simplified for now
}

export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return { error: error.message };
  return { data };
}

export async function signUpUser(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) return { error: error.message };
  return { data };
}

export async function deleteAllChatHistory(email) {
  await supabase.from('chat_sessions').delete().eq('email', email);
}
