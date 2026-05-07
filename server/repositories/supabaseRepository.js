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
    && !/\b(i am|i'm|looking|find|mentor|student|university|college|high school|linkedin)\b/i.test(firstUserMessage)
      ? firstUserMessage.replace(/^my name is\s+/i, '').trim()
      : null;

  const isUniversityStudent = /\b(university student|college student|freshman|sophomore|junior|senior|undergrad|undergraduate|i go to|i study at|my university|my college)\b/i.test(joined);
  const isHighSchoolStudent = /\b(high school|secondary school|applying|prospective|college applications|university applications)\b/i.test(joined);
  const linkedinUrl = joined.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-_%]+\/?/i)?.[0] || null;
  const universityMatch = joined.match(/\b(?:i go to|i study at|i'm at|i am at|my university is|my college is)\s+([A-Z][A-Za-z&.\-\s]{2,60})/i)
    || joined.match(/\b([A-Z][A-Za-z&.\-\s]{2,45}\s+(?:University|College|School|Institute))\b/);
  const university = universityMatch?.[1]?.replace(/[.?!,].*$/, '').trim() || null;
  const majorMatch = joined.match(/\b(?:major(?:ing)? in|study(?:ing)?|my major is)\s+([A-Za-z&,\-\s]{2,60})/i);
  const major = majorMatch?.[1]?.replace(/[.?!].*$/, '').trim() || null;

  const interests = safeArray([
    lower.includes('finance') && 'finance',
    lower.includes('startup') && 'startups',
    lower.includes('real estate') && 'real estate',
    lower.includes('luxury') && 'luxury',
    lower.includes('hospitality') && 'hospitality',
    lower.includes('climate') && 'climate',
    lower.includes('ai') && 'AI',
    lower.includes('law') && 'law',
    lower.includes('medicine') && 'medicine',
    lower.includes('engineering') && 'engineering',
  ]);
  const goals = safeArray([
    lower.includes('mentor') && 'find a mentor',
    lower.includes('intro') && 'warm introductions',
    lower.includes('internship') && 'internship guidance',
    lower.includes('career') && 'career clarity',
    lower.includes('apply') && 'application strategy',
    lower.includes('campus') && 'campus discovery',
  ]);
  const industries = safeArray(interests.filter(item => ['finance', 'real estate', 'hospitality', 'climate', 'AI', 'law', 'medicine'].includes(item)));

  const campusSignals = {
    university,
    major,
    studentType: isUniversityStudent ? 'university_student' : isHighSchoolStudent ? 'high_school_student' : 'unknown',
    vibe: extractAfterAny(joined, ['vibe', 'personality', 'feels like']),
    socialLife: extractAfterAny(joined, ['weekend', 'social scene', 'friends', 'party']),
    wellbeing: extractAfterAny(joined, ['stress', 'mental health', 'thriving', 'surviving']),
    academics: extractAfterAny(joined, ['classes', 'professors', 'workload', 'grades']),
    practicalLife: extractAfterAny(joined, ['housing', 'food', 'dorm', 'safe']),
    realityCheck: extractAfterAny(joined, ['nobody tells you', 'misconception', 'surprised', 'hard']),
  };

  return {
    likelyName,
    linkedinUrl,
    university,
    major,
    studentType: campusSignals.studentType,
    interests,
    goals,
    industries,
    campusSignals,
    rawContext: joined.slice(-6000),
  };
}

function extractAfterAny(text, needles) {
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const found = lines.find(line => needles.some(needle => line.toLowerCase().includes(needle)));
  return found?.slice(0, 280) || null;
}

export async function syncUserContextToPeople(email, messages = []) {
  if (!email) return;
  const userId = await getUserIdByEmail(email);
  if (!userId) return;

  const { data: user } = await supabase
    .from('users')
    .select('id, email, first_name, full_name, linkedin_url')
    .eq('id', userId)
    .maybeSingle();

  const context = inferUserContext(messages);
  const displayName = user?.full_name || user?.first_name || context.likelyName || email.split('@')[0];
  const role = context.studentType === 'university_student'
    ? `University student${context.university ? ` at ${context.university}` : ''}`
    : context.studentType === 'high_school_student'
      ? 'High school student exploring universities'
      : 'Luminous member building a profile';
  const background = [
    role,
    context.major ? `Major or focus: ${context.major}` : null,
    context.interests.length ? `Interests: ${context.interests.join(', ')}` : null,
    context.goals.length ? `Goals: ${context.goals.join(', ')}` : null,
  ].filter(Boolean).join('. ');

  if (context.likelyName && !user?.first_name && !user?.full_name) {
    await supabase
      .from('users')
      .update({ first_name: context.likelyName.split(/\s+/)[0], full_name: context.likelyName })
      .eq('id', userId);
  }

  const { error } = await supabase
    .from('people')
    .upsert({
      external_key: userId,
      name: displayName,
      background: background || 'Luminous member',
      current_role_text: role,
      location: context.university || null,
      linkedin_url: context.linkedinUrl || user?.linkedin_url || null,
      contact_email: email,
      willing_to_connect: true,
      expertise: context.interests,
      interests: context.interests,
      goals: context.goals,
      industries: context.industries,
      profile_json: {
        source: 'luminous_chat',
        studentType: context.studentType,
        university: context.university,
        major: context.major,
        campusSignals: context.campusSignals,
        rawContext: context.rawContext,
        lastSyncedAt: new Date().toISOString(),
      },
    }, { onConflict: 'external_key' });

  if (error) console.error('Error syncing user into people:', error);
}

export async function ensureUserPerson(email) {
  return syncUserContextToPeople(email, []);
}

// 2. CHAT PERSISTENCE (ROBUST SAVING)
export async function saveChatTranscript(email, messages) {
  if (!email) return;
  const userId = await getUserIdByEmail(email);
  await syncUserContextToPeople(email, messages);
  
  // Upsert session
  let { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    const { data: newSession, error: sErr } = await supabase
      .from('chat_sessions')
      .insert({ 
        user_id: userId, 
        email, 
        initial_query: messages[0]?.content?.substring(0, 100) || 'New Chat' 
      })
      .select('id')
      .single();
    if (sErr) throw sErr;
    session = newSession;
  } else {
    await supabase.from('chat_sessions').update({ updated_at: new Date() }).eq('id', session.id);
  }

  // Rewrite messages efficiently
  // Delete old ones first to ensure indices are clean
  await supabase.from('chat_messages').delete().eq('session_id', session.id);
  
  const formattedMessages = messages.map((m, index) => ({
    session_id: session.id,
    user_id: userId,
    email,
    role: m.role,
    content: m.content || '',
    payload: m.payload || null,
    message_index: index
  }));

  const { error: iErr } = await supabase.from('chat_messages').insert(formattedMessages);
  if (iErr) console.error('Error inserting messages:', iErr);
}

export async function deleteAllChatHistory(email) {
  if (!email) return;
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (session) {
    // Delete messages first (though cascades should handle it if set up)
    await supabase.from('chat_messages').delete().eq('session_id', session.id);
    await supabase.from('chat_sessions').delete().eq('id', session.id);
  }
}

export async function getLatestChatSession(email) {
  if (!email) return { messages: [] };
  
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return { messages: [] };

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('role, content, payload')
    .eq('session_id', session.id)
    .order('message_index', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error);
    return { messages: [] };
  }

  return { messages: messages || [] };
}

// 3. INTRO LIMIT (3 per month)
export async function getIntroCountThisMonth(email) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const userId = await getUserIdByEmail(email);
  if (!userId) return 0;

  const { count, error } = await supabase
    .from('intros')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', firstDay);

  if (error) return 0;
  return count || 0;
}

export async function addIntro(email, requestId, candidateId) {
  const userId = await getUserIdByEmail(email);
  await supabase
    .from('intros')
    .insert({ user_id: userId, request_id: requestId, candidate_id: candidateId });
}

// 4. MATCHING ENGINE
export async function findBestMatches(userContext) {
  const { data: people, error } = await supabase
    .from('people')
    .select('*')
    .eq('willing_to_connect', true)
    .limit(100);

  if (error || !people) return [];

  return people.map(person => {
    let score = 0;
    const query = (userContext || '').toLowerCase();
    
    if (person.expertise && Array.isArray(person.expertise)) {
      person.expertise.forEach(exp => {
        if (query.includes(exp.toLowerCase())) score += 30;
      });
    }

    if (person.location && query.includes(person.location.toLowerCase())) score += 20;
    if (person.background && query.includes(person.background.toLowerCase())) score += 15;

    return { ...person, score };
  })
  .sort((a,b) => b.score - a.score)
  .slice(0, 2);
}
