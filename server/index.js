import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

import { 
  saveChatTranscript, 
  getLatestChatSession, 
  getSearchQuota,
  addIntro,
  saveWaitlistLead,
  saveCampusContribution,
  saveLinkedInProfileImport,
  deleteAllChatHistory,
  getCampusesWithScouts,
  supabase
} from './repositories/supabaseRepository.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8787;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const supabaseAuth = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '');

async function requireAuth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data.user?.email) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  req.auth = {
    userId: data.user.id,
    email: data.user.email.toLowerCase(),
  };
  next();
}

// 1. HELPERS
async function callDeepSeek(messages, jsonMode = false) {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: messages,
        response_format: jsonMode ? { type: 'json_object' } : undefined
      })
    });
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    console.error('DeepSeek API Error:', err);
    throw err;
  }
}

function extractLinkedInFromUrl(url) {
  const patterns = [
    /linkedin\.com\/in\/([a-zA-Z0-9-]+)/,
    /linkedin\.com\/in\//,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/-/g, ' ');
    }
  }
  return null;
}

function extractLinkedInUrlFromText(text = '') {
  const match = String(text).match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-_%]+\/?/i)
    || String(text).match(/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-_%]+\/?/i);
  if (!match) return null;
  const raw = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
  return raw.replace(/[),.]+$/, '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item).slice(0, 160));
  if (typeof value === 'string' && value.trim()) return [value.trim().slice(0, 160)];
  return [];
}

function buildSystemPrompt(messages) {
  return `You are Luminous, a professional mentor matching assistant. You MUST follow this strict sequence:

STAGE 1 - NAME: Ask "What should I call you?" Wait for their name.
STAGE 2 - ACADEMIC STATUS: Ask if they are a High School or University student.
STAGE 3 - DEEP EXPERIENCE: 
- If University: Ask about their college experience (vibe, involvement, defining moments).
- If High School: Ask about their aspirations and what they hope to get out of college.
STAGE 4 - GOAL: Ask "What are you looking for in a mentor?" Understand their high-level goal.
STAGE 5 - SPECIFICS: Ask "What's the specific challenge you're working through right now?" Get 1-2 deep specifics.
STAGE 6 - LINKEDIN: Ask "Please provide your LinkedIn profile URL so I can understand your professional background." This is REQUIRED. Do NOT skip or move past this stage without a LinkedIn URL.
STAGE 7 - PASTE (Recommended): After receiving LinkedIn, explain that Luminous can save the URL, but the best extraction comes when they paste the visible LinkedIn sections: About, Experience, Education, Skills, projects, and certifications. Say they can also paste an AI summary. Say 'Skip & Search' to proceed without it.
STAGE 8 - SEARCH: Once you have name, academic status, experience, goal, specifics, and LinkedIn (with or without paste), say "I'm synthesizing everything to find your matches..." and wait for user to say "Search" or similar trigger word.

STYLE REQUIREMENTS:
- Minimalist, professional, neutral. iMessage-like.
- No emojis. Short, focused responses.
- If they provide a LinkedIn URL, acknowledge with "Got it" and move to Stage 7.
- If they say "Skip" or "Skip & Search", acknowledge and move to Stage 8.
- The word "Search" from user triggers the matching process.`;
}

async function rankCandidatesWithDeepSeek(userContext, email) {
  const { data: allPeople } = await supabase.from('people').select('*');
  
  if (!allPeople || allPeople.length === 0) {
    return { candidates: [] };
  }

  const contextLower = userContext.toLowerCase();
  
  const keywords = [
    ...contextLower.match(/\b[a-z]{4,}\b/g || []),
    ...contextLower.match(/[A-Z][a-z]+/g || []),
  ].filter(w => !['that', 'this', 'with', 'have', 'from', 'looking', 'want', 'need', 'help', 'like', 'just', 'what', 'some', 'would', 'could', 'should'].includes(w.toLowerCase()));

  const keywordSet = new Set(keywords);
  
  const scoredMentors = allPeople.map(m => {
    let score = 0;
    
    const expertise = Array.isArray(m.expertise) ? m.expertise : (typeof m.expertise === 'string' ? JSON.parse(m.expertise || '[]') : []);
    const industries = Array.isArray(m.industries) ? m.industries : (typeof m.industries === 'string' ? JSON.parse(m.industries || '[]') : []);
    const interests = Array.isArray(m.interests) ? m.interests : (typeof m.interests === 'string' ? JSON.parse(m.interests || '[]') : []);
    const goals = Array.isArray(m.goals) ? m.goals : (typeof m.goals === 'string' ? JSON.parse(m.goals || '[]') : []);
    const background = (m.background || '').toLowerCase();
    
    const allFields = [
      ...expertise.map(e => e.toLowerCase()),
      ...industries.map(i => i.toLowerCase()),
      ...interests.map(i => i.toLowerCase()),
      ...goals.map(g => g.toLowerCase()),
      background
    ].join(' ');
    
    keywordSet.forEach(keyword => {
      if (allFields.includes(keyword.toLowerCase())) {
        score += 1;
      }
    });
    
    return { ...m, filterScore: score };
  });
  
  const filteredMentors = scoredMentors
    .filter(m => m.filterScore > 0)
    .sort((a, b) => b.filterScore - a.filterScore);
  
  const topMentorsForRanking = filteredMentors.length > 0 
    ? filteredMentors.slice(0, 20) 
    : scoredMentors.slice(0, 20);
  
  const mentorsList = topMentorsForRanking.map(m => {
    const expertise = Array.isArray(m.expertise) ? m.expertise : [];
    const industries = Array.isArray(m.industries) ? m.industries : [];
    const goals = Array.isArray(m.goals) ? m.goals : [];
    return `ID: ${m.id}
Name: ${m.name}
Role: ${m.current_role_text || m.currentRole || 'Mentor'}
Expertise: ${expertise.join(', ')}
Background: ${m.background || ''}
Goals: ${goals.join(', ')}
Industries: ${industries.join(', ')}`;
  }).join('\n---\n');
  
  const systemPrompt = `You are an expert matching engine for Luminous.
Rank the top 3 mentors from the provided list based on the user's context.
The user has provided their goal, challenges, and professional background.

RANKING CRITERIA:
1. Alignment with user's stated goal and challenges
2. Industry or expertise overlap
3. Career stage fit (can they provide relevant guidance?)
4. Shared context or interests

IMPORTANT: You MUST return exactly 3 candidates (or fewer if not enough mentors exist).

Return ONLY a JSON object with this exact structure:
{
  "candidates": [
    {
      "id": "exact_UUID_FROM_LIST",
      "name": "exact_Name_FROM_LIST", 
      "reason": "Specific reason why this mentor is the best match for user's deep specifics and trajectory."
    }
  ]
}`;

  const userPrompt = `USER CONTEXT:
${userContext}

MENTOR LIST (ranked by keyword relevance):
${mentorsList}

Select the top 3 mentors that best match the user's needs. Return your response as a JSON object.`;

  let result;
  try {
    result = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], true);
  } catch (err) {
    console.error('DeepSeek ranking failed, falling back to deterministic:', err);
    return rankCandidatesDeterministic(topMentorsForRanking, userContext);
  }

  try {
    const parsed = JSON.parse(result);
    const candidates = parsed.candidates || [];
    
    const { data: request } = await supabase.from('match_requests').insert({
        requester_email: email,
        status: 'consent_pending'
    }).select('id').single();

    const candidatesWithRequest = [];
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const person = allPeople.find(p => p.id === c.id);
        if (!person) continue;
        
        const { data: candidateRecord } = await supabase.from('match_candidates').insert({
            request_id: request?.id,
            person_id: c.id,
            rank: i + 1,
            score: 100 - (i * 10),
            reason: c.reason
        }).select('id').single();
        
        candidatesWithRequest.push({
            id: candidateRecord?.id || c.id,
            name: c.name,
            reason: c.reason,
            requestId: request?.id,
            linkedinUrl: person?.linkedin_url || `https://linkedin.com/in/${c.name.toLowerCase().replace(/\s+/g, '-')}`
        });
    }
    return { candidates: candidatesWithRequest };
  } catch (err) {
    console.error('Failed to rank or save candidates:', err);
    return rankCandidatesDeterministic(topMentorsForRanking, userContext);
  }
}

function rankCandidatesDeterministic(mentors, userContext) {
  const contextLower = userContext.toLowerCase();
  
  const scored = mentors.map(m => {
    let score = 0;
    const expertise = Array.isArray(m.expertise) ? m.expertise : [];
    const industries = Array.isArray(m.industries) ? m.industries : [];
    
    expertise.forEach(exp => {
      if (contextLower.includes(exp.toLowerCase())) score += 20;
    });
    industries.forEach(ind => {
      if (contextLower.includes(ind.toLowerCase())) score += 15;
    });
    if (m.background && contextLower.includes(m.background.toLowerCase().slice(0, 50))) score += 10;
    
    return { ...m, score };
  }).sort((a, b) => b.score - a.score);
  
  const top3 = scored.slice(0, 3);
  
  return {
    candidates: top3.map((m, i) => ({
      id: m.id,
      name: m.name,
      reason: `Matched on expertise: ${(Array.isArray(m.expertise) ? m.expertise : []).slice(0, 2).join(', ')}`,
      linkedinUrl: m.linkedin_url || `https://linkedin.com/in/${m.name?.toLowerCase().replace(/\s+/g, '-')}`
    }))
  };
}

function fallbackLinkedinExtraction({ linkedinUrl, profileText = '' }) {
  const slug = extractLinkedInFromUrl(linkedinUrl) || '';
  const formattedName = slug
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
  const text = profileText.toLowerCase();
  const inferredSkills = [
    ['strategy', 'Strategy'],
    ['operations', 'Operations'],
    ['product', 'Product'],
    ['finance', 'Finance'],
    ['investment', 'Investing'],
    ['real estate', 'Real Estate'],
    ['hospitality', 'Hospitality'],
    ['ai', 'AI'],
    ['marketing', 'Marketing'],
    ['founder', 'Entrepreneurship'],
    ['consulting', 'Consulting'],
    ['data', 'Data'],
  ]
    .filter(([needle]) => text.includes(needle))
    .map(([, label]) => label);
  const skills = inferredSkills.length ? inferredSkills : ['Strategy', 'Communication', 'Leadership'];

  return {
    name: formattedName || 'LinkedIn member',
    headline: profileText.match(/headline[:\s]+(.{8,120})/i)?.[1]?.trim() || 'Professional profile imported from LinkedIn context',
    currentRole: profileText.match(/(?:current|role|title)[:\s]+(.{8,120})/i)?.[1]?.trim() || null,
    company: profileText.match(/company[:\s]+(.{3,80})/i)?.[1]?.trim() || null,
    location: profileText.match(/location[:\s]+(.{3,80})/i)?.[1]?.trim() || null,
    summary: profileText.trim()
      ? `Imported LinkedIn context for ${formattedName || 'this person'} with signals around ${skills.slice(0, 4).join(', ')}.`
      : `Imported LinkedIn URL for ${formattedName || 'this person'}. Paste profile text for deeper extraction.`,
    specificReason: null,
    targetPerson: null,
    industries: skills.filter(skill => ['Finance', 'Real Estate', 'Hospitality', 'AI', 'Consulting'].includes(skill)),
    locations: [],
    skills,
    educationSignals: profileText.match(/\b(university|college|school|mba|bachelor|master|oxford|cambridge|harvard|hec|wharton)\b/gi)?.slice(0, 8) || [],
    interests: [],
    goals: [],
    constraints: profileText.trim() ? [] : ['Needs pasted LinkedIn profile text for full extraction'],
    missingInfo: profileText.trim() ? [] : ['Paste the profile About, Experience, Education, and Skills sections.'],
    confidence: profileText.length > 500 ? 'medium' : 'light',
    extractionMode: 'linkedin_fallback',
    sourceDetail: profileText.trim() ? 'linkedin_url_and_pasted_profile_text' : 'linkedin_url_only',
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    volunteer: [],
    publicSignals: [linkedinUrl],
    rawSignalCount: profileText.length,
  };
}

async function extractLinkedinProfile({ linkedinUrl, profileText = '', conversationText = '' }) {
  const fallback = fallbackLinkedinExtraction({ linkedinUrl, profileText });
  if (!DEEPSEEK_API_KEY || (!profileText.trim() && !conversationText.trim())) return fallback;

  const boundedProfileText = profileText.slice(0, 14000);
  const boundedConversation = conversationText.slice(-7000);

  try {
    const result = await callDeepSeek([
      {
        role: 'system',
        content: `Extract structured profile data from LinkedIn profile text and Luminous chat context.
Do not invent facts. If a field is not present, use null or [].
Return JSON only with:
name, headline, currentRole, company, location, summary, specificReason, targetPerson,
industries, locations, skills, educationSignals, interests, goals, constraints, missingInfo,
confidence as light|medium|high, experience array, education array, certifications array,
projects array, volunteer array, publicSignals array.`,
      },
      {
        role: 'user',
        content: `LinkedIn URL: ${linkedinUrl}

Pasted LinkedIn profile text:
${boundedProfileText || '[No pasted profile text provided]'}

Relevant Luminous chat context:
${boundedConversation || '[No chat context provided]'}`,
      },
    ], true);
    const parsed = JSON.parse(result);
    return {
      ...fallback,
      name: parsed.name || fallback.name,
      headline: parsed.headline || fallback.headline,
      currentRole: parsed.currentRole || fallback.currentRole,
      company: parsed.company || fallback.company,
      location: parsed.location || fallback.location,
      summary: String(parsed.summary || fallback.summary).slice(0, 1200),
      specificReason: parsed.specificReason || fallback.specificReason,
      targetPerson: parsed.targetPerson || fallback.targetPerson,
      industries: asArray(parsed.industries),
      locations: asArray(parsed.locations),
      skills: asArray(parsed.skills).length ? asArray(parsed.skills) : fallback.skills,
      educationSignals: asArray(parsed.educationSignals),
      interests: asArray(parsed.interests),
      goals: asArray(parsed.goals),
      constraints: asArray(parsed.constraints),
      missingInfo: asArray(parsed.missingInfo),
      confidence: ['light', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : fallback.confidence,
      experience: Array.isArray(parsed.experience) ? parsed.experience.slice(0, 12) : [],
      education: Array.isArray(parsed.education) ? parsed.education.slice(0, 8) : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications.slice(0, 8) : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects.slice(0, 8) : [],
      volunteer: Array.isArray(parsed.volunteer) ? parsed.volunteer.slice(0, 8) : [],
      publicSignals: asArray(parsed.publicSignals).length ? asArray(parsed.publicSignals) : [linkedinUrl],
      rawSignalCount: boundedProfileText.length,
      extractionMode: 'deepseek_linkedin_profile',
      sourceDetail: boundedProfileText ? 'linkedin_url_and_pasted_profile_text' : 'linkedin_url_and_chat_context',
    };
  } catch (err) {
    console.error('LinkedIn profile extraction fallback:', err);
    return fallback;
  }
}

async function moderateCampusContribution({ campusName, input }) {
  const fallback = {
    shouldAdd: input.trim().length >= 80,
    category: inferContributionCategory(input),
    publicSummary: input.trim().slice(0, 220),
    confidence: input.trim().length >= 80 ? 0.72 : 0.38,
    rationale: input.trim().length >= 80
      ? 'Specific enough for the campus profile review queue.'
      : 'Needs more concrete detail before it can update the public profile.',
  };

  if (!DEEPSEEK_API_KEY) return fallback;

  try {
    const result = await callDeepSeek([
      {
        role: 'system',
        content: `You moderate student campus intelligence for Luminous.
Decide whether a student's note should be added to a university discovery profile.
Approve only if it is specific, useful to applicants, non-harmful, and not a private personal attack.
Return JSON only with: shouldAdd boolean, category one of hidden_gem|reality_check|network_map|culture|academics|other, publicSummary string, confidence number 0-1, rationale string.`,
      },
      {
        role: 'user',
        content: `Campus: ${campusName}
Student note: ${input}`,
      },
    ], true);
    const parsed = JSON.parse(result);
    return {
      shouldAdd: Boolean(parsed.shouldAdd),
      category: parsed.category || fallback.category,
      publicSummary: String(parsed.publicSummary || fallback.publicSummary).slice(0, 320),
      confidence: Number(parsed.confidence || fallback.confidence),
      rationale: String(parsed.rationale || fallback.rationale).slice(0, 300),
    };
  } catch (err) {
    console.error('Contribution moderation fallback:', err);
    return fallback;
  }
}

function inferContributionCategory(input) {
  const text = input.toLowerCase();
  if (text.includes('club') || text.includes('internship') || text.includes('network')) return 'network_map';
  if (text.includes('library') || text.includes('study') || text.includes('place')) return 'hidden_gem';
  if (text.includes('dorm') || text.includes('food') || text.includes('hard') || text.includes('stress')) return 'reality_check';
  if (text.includes('class') || text.includes('professor') || text.includes('major')) return 'academics';
  if (text.includes('social') || text.includes('vibe') || text.includes('community')) return 'culture';
  return 'other';
}

// 2. ROUTES
app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message || 'Invalid email or password' });

    res.json({
      email: data.user?.email,
      accessToken: data.session?.access_token,
      userId: data.user?.id,
    });
  } catch (err) {
    console.error('Auth login failed:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.get('/api/chat/latest', requireAuth, async (req, res) => {
  const email = req.auth.email;
  try {
    const session = await getLatestChatSession(email);
    res.json(session || { messages: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/api/campuses', requireAuth, async (req, res) => {
  try {
    const campuses = await getCampusesWithScouts();
    res.json(campuses);
  } catch (err) {
    console.error('Error fetching campuses:', err);
    res.status(500).json({ error: 'Failed to fetch campuses' });
  }
});

app.post('/api/waitlist', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const initialQuery = String(req.body?.initialQuery || '').trim().slice(0, 1200);
  const source = String(req.body?.source || 'landing').trim().slice(0, 80);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    await saveWaitlistLead({ email, initialQuery, source });
    res.status(201).json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to save waitlist lead' });
  }
});

app.post('/api/campus-contributions', requireAuth, async (req, res) => {
  const campusSlug = String(req.body?.campusSlug || '').trim().slice(0, 120);
  const campusName = String(req.body?.campusName || '').trim().slice(0, 160);
  const email = req.auth.email;
  const input = String(req.body?.input || '').trim().slice(0, 3000);

  if (!campusSlug || !campusName || input.length < 20) {
    return res.status(400).json({ error: 'Campus and a more detailed contribution are required.' });
  }

  try {
    const decision = await moderateCampusContribution({ campusName, input });
    await saveCampusContribution({ campusSlug, campusName, email, input, decision });
    res.status(201).json({
      decision,
      message: decision.shouldAdd
        ? `Accepted for the ${campusName} review queue as ${decision.category.replace('_', ' ')}.`
        : `Saved privately, but not added to the public ${campusName} profile yet: ${decision.rationale}`,
    });
  } catch {
    res.status(500).json({ error: 'Failed to review contribution.' });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages } = req.body;
  const email = req.auth.email;
  const lastMessage = messages[messages.length - 1].content;

  if (lastMessage === 'deleteall--00') {
    await deleteAllChatHistory(email);
    return res.json({ text: "All data cleared. System reset.", payload: { kind: 'reset' } });
  }

  try {
    const introCount = await getSearchQuota(email);
    const isIntroRequest = lastMessage.startsWith('Select ');

    if (isIntroRequest && introCount >= 3) {
      return res.status(429).json({ 
        text: "You've successfully connected with 3 mentors this month! We limit introductions to 3 per month to maintain quality.",
        payload: { kind: 'text', text: "Quota reached" }
      });
    }

    const conversationText = messages.map(m => m.content).join(' ');
    const conversationLower = conversationText.toLowerCase();
    const lastMessageLower = lastMessage.toLowerCase();
    const linkedinUrl = extractLinkedInUrlFromText(conversationText);
    
    const hasLinkedIn = conversationLower.includes('linkedin.com');
    const looksLikeLinkedInProfilePaste = Boolean(linkedinUrl)
      && lastMessage.length > 450
      && /(experience|education|about|skills|licenses|certifications|activity|headline|current|company)/i.test(lastMessage);
    const hasSearchTrigger = lastMessageLower.includes('search') || 
                             lastMessageLower.includes('find my matches') ||
                             lastMessageLower.includes('start matching');
    const isReadyToSearch = hasSearchTrigger && hasLinkedIn;

    if (looksLikeLinkedInProfilePaste && !isReadyToSearch) {
      const extraction = await extractLinkedinProfile({
        linkedinUrl,
        profileText: lastMessage,
        conversationText,
      });
      await saveLinkedInProfileImport({ email, linkedinUrl, extraction });
      const responseText = `I added that LinkedIn context to your profile. I pulled out ${extraction.skills.slice(0, 4).join(', ') || 'your background signals'} and saved it for matching. If that captures the important parts, say "Search" and I’ll start.`;
      await saveChatTranscript(email, [...messages, { role: 'assistant', content: responseText, payload: { kind: 'text' } }]);
      return res.json({ text: responseText, payload: { kind: 'text' } });
    }

    if (isReadyToSearch && !lastMessage.startsWith('Select ')) {
        const rankingResult = await rankCandidatesWithDeepSeek(conversationText, email);
        const responseText = "I've analyzed our 50-mentor network against your synthesized profile. Here are the most strategic connections for your current goals:";
        const payload = {
            kind: 'connection_started',
            title: "Your Top Matches",
            text: "Based on your LinkedIn profile and stated goals.",
            candidates: rankingResult.candidates,
            note: `${3 - introCount} introductions remaining this month.`
        };
        await saveChatTranscript(email, [...messages, { role: 'assistant', content: responseText, payload }]);
        return res.json({ text: responseText, payload });
    }

    const systemPrompt = buildSystemPrompt(messages);
    const aiText = await callDeepSeek([
      { role: 'system', content: systemPrompt },
      ...messages.slice(-10)
    ]);

    let payload = { kind: 'text' };
    const aiLower = aiText.toLowerCase();
    if (aiLower.includes('paste') || aiLower.includes('career history') || aiLower.includes('skip & search')) {
        payload = {
            kind: 'upload_request',
            infoTitle: "Add Context (Optional)",
            infoBody: "Paste a brief summary of your career history or key insights from an AI conversation. Say 'Skip & Search' to proceed without it."
        };
    }
    await saveChatTranscript(email, [...messages, { role: 'assistant', content: aiText, payload }]);
    res.json({ text: aiText, payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ text: "I encountered a minor glitch. Could you try that again?" });
  }
});

app.post('/api/intros', requireAuth, async (req, res) => {
  const { requestId, candidateId } = req.body;
  const email = req.auth.email;
  try {
    await addIntro(email, requestId, candidateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record intro' });
  }
});

app.post('/api/linkedin-profile', requireAuth, async (req, res) => {
  const linkedinUrl = extractLinkedInUrlFromText(req.body?.linkedinUrl || '');
  const profileText = String(req.body?.profileText || '').slice(0, 16000);
  const conversationText = String(req.body?.conversationText || '').slice(0, 8000);

  if (!linkedinUrl) {
    return res.status(400).json({ error: 'Valid LinkedIn profile URL required' });
  }

  try {
    const profile = await extractLinkedinProfile({ linkedinUrl, profileText, conversationText });
    await saveLinkedInProfileImport({ email: req.auth.email, linkedinUrl, extraction: profile });
    res.json({
      success: true,
      profile,
      message: profileText
        ? 'LinkedIn profile text extracted and saved.'
        : 'LinkedIn URL saved. Paste profile text for deeper extraction.',
    });
  } catch (err) {
    console.error('Failed to extract profile:', err);
    res.status(500).json({ error: 'Failed to extract profile' });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Luminous Backend running at http://localhost:${PORT}`);
});
server.ref?.();

// The Codex desktop runtime can run Node with no persistent stdio handle.
// Keep the local development API alive explicitly.
setInterval(() => {}, 1 << 30);
