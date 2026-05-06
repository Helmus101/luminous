import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { 
  saveChatTranscript, 
  getLatestChatSession, 
  getIntroCountThisMonth,
  addIntro
} from './repositories/supabaseRepository.js';
import { generateChatResponse, extractStructuredProfile } from './matchingEngine.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// 1. CHAT HISTORY PERSISTENCE
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
  
  try {
    // 2. INTRO LIMIT (3 per month) - REPLACED SEARCH LIMIT
    // We only block if they've already successfully had 3 introductions
    const introCount = await getIntroCountThisMonth(email);
    
    const lastMessage = messages[messages.length - 1].content;
    const isIntroRequest = lastMessage.startsWith('Select ');

    if (isIntroRequest && introCount >= 3) {
      return res.status(429).json({ 
        text: "You've successfully connected with 3 mentors this month! To ensure high-quality mentorship, we limit introductions to 3 per month. You can still search and chat, but new introductions will be available next month.",
        payload: { kind: 'text', text: "Intro limit reached" }
      });
    }

    // 3. SEMANTIC MATCHING (DeepSeek + Supabase)
    const aiResponse = await generateChatResponse(messages, email);
    
    // Auto-save history
    await saveChatTranscript(email, [...messages, { role: 'assistant', content: aiResponse.text, payload: aiResponse.payload }]);

    res.json(aiResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ text: "I'm having trouble thinking right now. Try again?" });
  }
});

// 4. INTRO TRACKING
app.post('/api/intros', async (req, res) => {
  const { email, requestId, candidateId } = req.body;
  try {
    await addIntro(email, requestId, candidateId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record intro' });
  }
});

// 5. LINKEDIN EXTRACTION
app.post('/api/linkedin-profile', async (req, res) => {
  const { linkedinUrl, email } = req.body;
  
  try {
    const profile = await extractStructuredProfile(linkedinUrl);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract profile' });
  }
});

app.listen(PORT, () => {
  console.log(`Luminous Backend running at http://localhost:${PORT}`);
});
