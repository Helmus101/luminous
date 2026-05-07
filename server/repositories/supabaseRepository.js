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
  const lower = joined.toLowerCase();
  
  const firstUserMessage = userMessages[0]?.trim() || '';
  const likelyName = firstUserMessage.length <= 42
    && !/[?]/.test(firstUserMessage)
    && !/\\b(i am|i'm|looking|find|mentor|student|university|college|high school|linkedin)\\b/i.test(firstUserMessage)
      ? firstUserMessage.replace(/^my name is\\s+/i, '').trim()
      : null;

  const isUniversityStudent = /\\b(university student|college student|freshman|sophomore|junior|senior|undergrad|undergraduate|i go to|i study at|my university|my college)\\b/i.test(joined);
  const isHighSchoolStudent = /\\b(high school|secondary school|applying|prospective|college applications|university applications)\\b/i.test(joined);
  
  return {
    likelyName,
    studentType: isUniversityStudent ? 'university_student' : isHighSchoolStudent ? 'high_school_student' : 'unknown',
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
      profile_json: {
        studentType: context.studentType,
        lastSyncedAt: new Date().toISOString(),
      },
    }, { onConflict: 'external_key' });
}

export async function ensureUserPerson(email) {
  return syncUserContextToPeople(email, []);
}

export async function saveWaitlistLead({ email, studentType, source }) {
  await supabase.from('waitlist').insert({ email, student_type: studentType, source });
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
