import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { 
  saveChatTranscript, 
  getLatestChatSession, 
  getSearchQuota,
  addIntro,
  deleteAllChatHistory,
  supabase
} from './repositories/supabaseRepository.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

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

function buildSystemPrompt(messages) {
  return `You are Luminous, a professional mentor matching assistant. You MUST follow this strict sequence:

STAGE 1 - NAME: Ask "What should I call you?" Wait for their name.
STAGE 2 - GOAL: Ask "What are you looking for in a mentor?" Understand their high-level goal.
STAGE 3 - SPECIFICS: Ask "What's the specific challenge you're working through right now?" Get 1-2 deep specifics.
STAGE 4 - LINKEDIN: Ask "Please provide your LinkedIn profile URL so I can understand your professional background." This is REQUIRED. Do NOT skip or move past this stage without a LinkedIn URL.
STAGE 5 - PASTE (Optional): After receiving LinkedIn, say "Optionally, you can paste a summary of your career or key AI conversation for deeper matching. Say 'Skip & Search' to proceed without it."
STAGE 6 - SEARCH: Once you have name, goal, specifics, and LinkedIn (with or without paste), say "I'm synthesizing everything to find your matches..." and wait for user to say "Search" or similar trigger word.

STYLE REQUIREMENTS:
- Minimalist, professional, neutral. iMessage-like.
- No emojis. Short, focused responses.
- If they provide a LinkedIn URL, acknowledge with "Got it" and move to Stage 5.
- If they say "Skip" or "Skip & Search", acknowledge and move to Stage 6.
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

function buildMockLinkedinProfile(url) {
    const slugMatch = url.match(/linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
    const slug = slugMatch ? slugMatch[1] : '';
    
    const nameParts = slug.replace(/-/g, ' ').split(' ').filter(p => p.length > 0);
    const formattedName = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    
    return {
        summary: `Profile extracted from LinkedIn: ${formattedName || 'Professional'} - Senior professional with expertise in operations, strategy, and leadership. Strong background in scaling teams and driving growth across multiple industries.`,
        skills: ["Operations", "Strategy", "Leadership", "Scaling", "Team Building", "Business Development"],
        name: formattedName || 'Professional',
        headline: "Senior Leader | Operations & Strategy",
        location: "Global"
    };
}

// 2. ROUTES
app.get('/api/chat/latest', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  try {
    const session = await getLatestChatSession(email);
    res.json(session || { messages: [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages, email } = req.body;
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
    
    const hasLinkedIn = conversationLower.includes('linkedin.com');
    const hasSearchTrigger = lastMessageLower.includes('search') || 
                             lastMessageLower.includes('find my matches') ||
                             lastMessageLower.includes('start matching');
    const isReadyToSearch = hasSearchTrigger && hasLinkedIn;

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

app.post('/api/intros', async (req, res) => {
  const { email, requestId, candidateId } = req.body;
  try {
    await addIntro(email, requestId, candidateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record intro' });
  }
});

app.post('/api/linkedin-profile', async (req, res) => {
  const { linkedinUrl, email } = req.body;
  try {
    const profile = buildMockLinkedinProfile(linkedinUrl);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract profile' });
  }
});

app.listen(PORT, () => {
  console.log(`Luminous Backend running at http://localhost:${PORT}`);
});
