import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 1. INTRO LIMIT (3 per month)
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

  if (error) {
    console.error('Error fetching intro count:', error);
    return 0;
  }
  return count || 0;
}

export async function addIntro(email, requestId, candidateId) {
  const userId = await getUserIdByEmail(email);
  const { error } = await supabase
    .from('intros')
    .insert({ user_id: userId, request_id: requestId, candidate_id: candidateId });
  
  if (error) console.error('Error saving intro:', error);
}

// 2. CHAT PERSISTENCE
export async function getLatestChatSession(email) {
  const { data: session, error: sError } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return { messages: [] };

  const { data: messages, error: mError } = await supabase
    .from('chat_messages')
    .select('role, content, payload')
    .eq('session_id', session.id)
    .order('message_index', { ascending: true });

  return { messages: messages || [] };
}

export async function saveChatTranscript(email, messages) {
  const userId = await getUserIdByEmail(email);
  
  // Upsert session
  let { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('email', email)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    const { data: newSession } = await supabase
      .from('chat_sessions')
      .insert({ user_id: userId, email, initial_query: messages[0]?.content })
      .select('id')
      .single();
    session = newSession;
  } else {
    await supabase.from('chat_sessions').update({ updated_at: new Date() }).eq('id', session.id);
  }

  // Rewrite messages
  await supabase.from('chat_messages').delete().eq('session_id', session.id);
  
  const formattedMessages = messages.map((m, index) => ({
    session_id: session.id,
    user_id: userId,
    email,
    role: m.role,
    content: m.content,
    payload: m.payload,
    message_index: index
  }));

  await supabase.from('chat_messages').insert(formattedMessages);
}

// 3. SEMANTIC SEARCH / MATCHING
export async function findBestMatches(userContext) {
  // Real backend matching: query the 'people' table in Supabase
  // We use keywords from the context to score people
  const { data: people, error } = await supabase
    .from('people')
    .select('*')
    .eq('willing_to_connect', true);

  if (error) {
    console.error('Error fetching people:', error);
    return [];
  }

  // REAL scoring based on background, expertise, and location in the database
  return people.map(person => {
    let score = 0;
    const query = userContext.toLowerCase();
    
    // Check expertise
    if (person.expertise && Array.isArray(person.expertise)) {
      person.expertise.forEach(exp => {
        if (query.includes(exp.toLowerCase())) score += 30;
      });
    }

    // Check location
    if (person.location && query.includes(person.location.toLowerCase())) {
      score += 20;
    }

    // Check background keywords
    if (person.background && query.includes(person.background.toLowerCase())) {
        score += 15;
    }

    return { ...person, score };
  })
  .sort((a,b) => b.score - a.score)
  .slice(0, 2);
}

// HELPERS
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
