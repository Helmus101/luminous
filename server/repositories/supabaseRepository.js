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

export async function getPersonByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('contact_email', email)
    .maybeSingle();
  return data;
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

export async function syncUserContextToPeople(email, extractedContext = {}) {
  if (!email) return;
  const userId = await getUserIdByEmail(email);
  if (!userId) return;

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  // If extractedContext is actually messages (from old calls), we just ignore it or handle it.
  // In the new flow, it should be an object.
  const ctx = Array.isArray(extractedContext) ? {} : extractedContext;

  const displayName = user?.full_name || user?.first_name || ctx.name || email.split('@')[0];

  await supabase
    .from('people')
    .upsert({
      external_key: userId,
      name: displayName,
      contact_email: email,
      linkedin_url: ctx.linkedin_url,
      background: ctx.university ? `Student at ${ctx.university}` : 'Member of the Luminous community',
      current_role_text: ctx.student_type === 'university_student' ? 'University Student' : ctx.student_type === 'high_school_student' ? 'High School Student' : 'Member',
      profile_json: {
        studentType: ctx.student_type,
        university: ctx.university,
        interests: ctx.interests,
        lastSyncedAt: new Date().toISOString(),
      },
    }, { onConflict: 'external_key' });
}

export async function ensureUserPerson(email) {
  return syncUserContextToPeople(email, {});
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

export async function saveChatTranscript(email, messages, extractedContext = {}) {
  if (!email) return;
  const userId = await getUserIdByEmail(email);
  
  // Sync context
  await syncUserContextToPeople(email, extractedContext);
  
  await supabase
    .from('chat_sessions')
    .upsert({
      email,
      user_id: userId,
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
