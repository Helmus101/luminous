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
  addToWaitlist,
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

function buildSystemPrompt(messages) {
  const text = messages.map(m => m.content).join(' ').toLowerCase();
  
  let stage = 'name';
  if (text.length > 5) stage = 'goal';
  if (text.includes('mentor') || text.includes('looking for')) stage = 'specifics';
  if (text.includes('linkedin.com')) stage = 'history';
  if (text.includes('skip') || text.includes('history') || text.includes('summary')) stage = 'search';

  return `You are Luminous, a professional, minimalist mentor matching assistant.
You MUST follow this strict sequence:
1. Name: Get their name.
2. Goal: Understand their high-level goal.
3. Deep Specifics: Ask for 1-2 deep specific challenges.
4. LinkedIn: Ask for their LinkedIn URL. (Gate: Do not move to stage 5 without it).
5. AI History: Explain that pasting a "Prompt & Paste" summary from ChatGPT/Claude adds high value. It's optional - they can say "Skip & Search".
6. Search: Once all context is gathered, trigger the search.

Current context indicates you are around stage: ${stage}.
Style: Minimalist, professional, neutral. iMessage-like. No emojis. Short responses.
If they provide a LinkedIn URL, acknowledge and move to AI History.
If they say "Skip" or provide history, say "I'm synthesizing everything to find your matches..." and wait for the search trigger.`;
}

async function rankCandidatesWithDeepSeek(userContext, email) {
  const { data: allPeople } = await supabase.from('people').select('*');
  
  const mentorsList = allPeople.map(m => (
    `ID: ${m.id}\nName: ${m.name}\nRole: ${m.current_role_text}\nExpertise: ${JSON.stringify(m.expertise)}\nBackground: ${m.background}\nGoals: ${JSON.stringify(m.goals)}\nIndustries: ${JSON.stringify(m.industries)}`
  )).join('\n---\n');
  
  const systemPrompt = `You are an expert matching engine.
Rank the top 3 mentors from the provided list based on the user's context.
Context includes their goal, professional background (LinkedIn), and career history.

Return ONLY a JSON object:
{
  "candidates": [
    {
      "id": "UUID_FROM_LIST",
      "name": "Name",
      "reason": "Specific reason why they match user's deep specifics and trajectory."
    }
  ]
}`;

  const userPrompt = `USER CONTEXT:
${userContext}

MENTOR LIST:
${mentorsList}`;

  const result = await callDeepSeek([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], true);

  try {
    const parsed = JSON.parse(result);
    const { data: request } = await supabase.from('match_requests').insert({
        requester_email: email,
        status: 'consent_pending'
    }).select('id').single();

    const candidatesWithRequest = [];
    for (let i = 0; i < parsed.candidates.length; i++) {
        const c = parsed.candidates[i];
        const person = allPeople.find(p => p.id === c.id);
        const { data: candidateRecord } = await supabase.from('match_candidates').insert({
            request_id: request.id,
            person_id: c.id,
            rank: i + 1,
            score: 100 - (i * 10),
            reason: c.reason
        }).select('id').single();
        
        candidatesWithRequest.push({
            id: candidateRecord.id,
            name: c.name,
            reason: c.reason,
            requestId: request.id,
            linkedinUrl: person?.linkedin_url || `https://linkedin.com/in/${c.name.toLowerCase().replace(' ', '-')}`
        });
    }
    return { candidates: candidatesWithRequest };
  } catch (err) {
    console.error('Failed to rank or save candidates:', err);
    return { candidates: [] };
  }
}

function buildMockLinkedinProfile(url) {
    const names = ["Alex", "Jordan", "Taylor", "Morgan", "Casey"];
    const name = names[Math.floor(Math.random() * names.length)];
    return {
        summary: `Extracted profile from ${url}: ${name} is a senior professional...`,
        skills: ["Operations", "Scaling", "Strategy", "Product"],
        name: name
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

    const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
    const isReadyToSearch = (lastMessage.toLowerCase().includes('skip') || 
                            lastMessage.length > 200 || 
                            (conversationText.includes('linkedin.com') && messages.length > 6)) 
                            && !isIntroRequest;

    if (isReadyToSearch && !lastMessage.startsWith('Select ')) {
        const rankingResult = await rankCandidatesWithDeepSeek(conversationText, email);
        const responseText = "I've analyzed our 50-mentor network against your synthesized profile. Here are the most strategic connections for your current goals:";
        const payload = {
            kind: 'connection_started',
            title: "Strategic Matches",
            text: "Based on your LinkedIn trajectory and stated goals.",
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
    if (aiText.toLowerCase().includes('history') || aiText.toLowerCase().includes('paste')) {
        payload = {
            kind: 'upload_request',
            infoTitle: "Paste Context",
            infoBody: "Optionally paste a summary of your career history or AI conversation for better matching."
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

app.post('/api/waitlist', async (req, res) => {
  const { email, query } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const result = await addToWaitlist(email, query);
    res.json({ success: true, wasNew: result.wasNew });
  } catch (err) {
    console.error('Failed to add to waitlist:', err);
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

app.listen(PORT, () => {
  console.log(`Luminous Backend running at http://localhost:${PORT}`);
});