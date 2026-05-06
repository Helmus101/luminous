// Mock Database / Supabase Interface
// In production, these calls would use the @supabase/supabase-js client

// 1. QUOTA TRACKING (Max 3/Month)
let matchRequests = []; // { email, timestamp }

export async function getMatchRequestCountThisMonth(email) {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  
  return matchRequests.filter(req => 
    req.email === email && 
    req.timestamp >= firstDay
  ).length;
}

export async function saveProposedMatches(email, candidates) {
  matchRequests.push({ email, timestamp: new Date(), candidates });
  console.log(`[DB] Saved search for ${email}. Total requests: ${matchRequests.length}`);
}

// 2. CHAT PERSISTENCE
let chatHistory = {}; // { email: [messages] }

export async function saveChatTranscript(email, messages) {
  chatHistory[email] = messages;
  console.log(`[DB] Transcript updated for ${email}`);
}

export async function getLatestChatSession(email) {
  return { messages: chatHistory[email] || [] };
}

// 3. USER PROFILE (From LinkedIn)
let userProfiles = {};

export async function updateUserProfileFromLinkedIn(email, profile) {
  userProfiles[email] = { ...userProfiles[email], ...profile, source: 'linkedin' };
  console.log(`[DB] Profile updated for ${email} from LinkedIn`);
}
