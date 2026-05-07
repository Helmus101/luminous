import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);

// 1. QUOTA SYSTEM (3 connected introductions per month)
export async function getSearchQuota(email) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // We count entries in the 'connections' table with status 'connected'
  // joined via match_requests for this user's email
  const { data: requests, error: rError } = await supabase
    .from('match_requests')
    .select('id')
    .eq('requester_email', email);

  if (rError || !requests || requests.length === 0) return 0;

  const requestIds = requests.map(r => r.id);

  const { count, error } = await supabase
    .from('connections')
    .select('*', { count: 'exact', head: true })
    .in('request_id', requestIds)
    .eq('status', 'connected')
    .gte('created_at', firstDay);

  if (error) {
    console.error('Error fetching quota:', error);
    return 0;
  }
  return count || 0;
}

// Backwards compatibility or alternative name
export async function getIntroCountThisMonth(email) {
  return getSearchQuota(email);
}

export async function addIntro(email, requestId, candidateId) {
  // If we have a requestId, we use it, otherwise we might need to create one
  // In the new flow, we should have a requestId from the matching stage
  
  const { error } = await supabase
    .from('connections')
    .insert({ 
      request_id: requestId, 
      candidate_id: candidateId,
      status: 'connected'
    });
  
  if (error) console.error('Error saving connection:', error);
}

export async function saveWaitlistLead({ email, initialQuery, source = 'landing' }) {
  const { error } = await supabase.from('waitlist').insert({
    email,
    initial_query: initialQuery,
    source,
  });

  if (error) {
    console.error('Error saving waitlist lead:', error);
    throw error;
  }
}

export async function saveCampusContribution({ campusSlug, campusName, email, input, decision }) {
  const payload = {
    campus_slug: campusSlug,
    campus_name: campusName,
    contributor_email: email || null,
    raw_input: input,
    status: decision.shouldAdd ? 'approved' : 'rejected',
    category: decision.category,
    public_summary: decision.publicSummary,
    confidence: decision.confidence,
    rationale: decision.rationale,
  };

  const { error } = await supabase.from('campus_contributions').insert(payload);
  if (error) {
    console.error('Error saving campus contribution:', error);
    throw error;
  }
}

export async function saveLinkedInProfileImport({ email, linkedinUrl, extraction }) {
  const userId = await getUserIdByEmail(email);

  await supabase
    .from('users')
    .update({ linkedin_url: linkedinUrl })
    .eq('email', email);

  const payload = {
    user_id: userId,
    email,
    source: 'linkedin',
    file_name: extraction.sourceDetail || 'linkedin_profile',
    summary: extraction.summary || 'LinkedIn profile imported.',
    specific_reason: extraction.specificReason || null,
    target_person: extraction.targetPerson || null,
    industries: extraction.industries || [],
    locations: extraction.locations || [],
    skills: extraction.skills || [],
    education_signals: extraction.educationSignals || [],
    interests: extraction.interests || [],
    goals: extraction.goals || [],
    constraints: extraction.constraints || [],
    confidence: extraction.confidence || 'medium',
    missing_info: extraction.missingInfo || [],
    extraction_mode: extraction.extractionMode || 'linkedin_fallback',
    profile_json: {
      linkedinUrl,
      name: extraction.name,
      headline: extraction.headline,
      currentRole: extraction.currentRole,
      company: extraction.company,
      location: extraction.location,
      experience: extraction.experience || [],
      education: extraction.education || [],
      certifications: extraction.certifications || [],
      projects: extraction.projects || [],
      volunteer: extraction.volunteer || [],
      publicSignals: extraction.publicSignals || [],
      rawSignalCount: extraction.rawSignalCount || 0,
    },
  };

  const { data, error } = await supabase
    .from('profiles')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('Error saving LinkedIn profile import:', error);
    throw error;
  }

  return data;
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
      .insert({ user_id: userId, email, initial_query: messages[0]?.content?.slice(0, 200) })
      .select('id')
      .single();
    session = newSession;
  } else {
    await supabase.from('chat_sessions').update({ updated_at: new Date() }).eq('id', session.id);
  }

  if (!session) return;

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

// 3. RESET COMMAND (deleteall--00) - Complete factory reset
export async function deleteAllChatHistory(email) {
  const userId = await getUserIdByEmail(email);
  
  // 1. Delete chat messages and sessions
  await supabase.from('chat_messages').delete().eq('email', email);
  await supabase.from('chat_sessions').delete().eq('email', email);
  
  // 2. Get match request IDs to delete related records
  const { data: requests } = await supabase
    .from('match_requests')
    .select('id')
    .eq('requester_email', email);
    
  if (requests && requests.length > 0) {
    const requestIds = requests.map(r => r.id);
    
    // Cascade delete for match_candidates, consent_emails, and connections
    await supabase.from('match_requests').delete().in('id', requestIds);
  }
  
  // 3. Delete profiles
  await supabase.from('profiles').delete().eq('email', email);
  
  // 4. Complete factory reset - delete user record
  if (userId) {
    await supabase.from('users').delete().eq('id', userId);
  }
}

// 4. CAMPUS CANVAS
export async function getCampusesWithScouts() {
  const { data: campuses, error: cError } = await supabase
    .from('campuses')
    .select('*')
    .order('name', { ascending: true });

  if (cError) {
    console.error('Error fetching campuses:', cError);
    return [];
  }

  const { data: scouts, error: sError } = await supabase
    .from('people')
    .select('id, name, current_role_text, campus_id')
    .not('campus_id', 'is', null);

  if (sError) {
    console.error('Error fetching scouts:', sError);
    return campuses.map(c => ({ ...c, scouts: [] }));
  }

  return campuses.map(campus => ({
    ...campus,
    scouts: scouts.filter(s => s.campus_id === campus.id)
  }));
}

// 5. SEMANTIC SEARCH / MATCHING (Used by legacy or as fallback)
export async function findBestMatches(userContext) {
  const { data: people, error } = await supabase
    .from('people')
    .select('*')
    .eq('willing_to_connect', true);

  if (error) {
    console.error('Error fetching people:', error);
    return [];
  }

  return people.map(person => {
    let score = 0;
    const query = userContext.toLowerCase();
    
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
  .slice(0, 3);
}

// HELPERS
async function getUserIdByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  
  if (data) return data.id;
  
  const { data: newUser, error: iError } = await supabase
    .from('users')
    .insert({ email })
    .select('id')
    .single();
    
  if (iError) {
      // Might already exist due to race condition
      const { data: retry } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
      return retry?.id;
  }
  return newUser?.id;
}
