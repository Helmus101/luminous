import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { 
  saveChatTranscript, 
  getLatestChatSession, 
  getIntroCountThisMonth,
  findBestMatches,
  deleteAllChatHistory,
  ensureUserPerson
} from './repositories/supabaseRepository.js';
import { generateChatResponse, extractStructuredProfile } from './matchingEngine.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

// 1. CHAT HISTORY PERSISTENCE
app.get('/api/chat/latest', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  try {
    await ensureUserPerson(email);
    const session = await getLatestChatSession(email);
    res.json(session);
  } catch (err) {
    console.error('Latest chat error:', err);
    res.status(500).json({ messages: [] });
  }
});

app.post('/api/users/ensure', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    await ensureUserPerson(email);
    res.json({ success: true });
  } catch (err) {
    console.error('Ensure user failed:', err);
    res.status(500).json({ error: 'Failed to create user profile' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages, email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const lastMsg = messages[messages.length - 1].content.trim();
    
    // 0. SYSTEM COMMANDS
    if (lastMsg.toLowerCase() === 'deleteall--00') {
      await deleteAllChatHistory(email);
      console.log(`History purged for ${email}`);
      return res.json({ 
        text: "History purged. We're starting with a clean slate.",
        payload: { kind: 'text', action: 'clear_chat' } 
      });
    }

    // Check quota for searches
    const count = await getIntroCountThisMonth(email);
    const isSearchRequest = lastMsg.toLowerCase().includes('search') || lastMsg.toLowerCase().includes('match') || lastMsg.toLowerCase().includes('mentor');

    if (isSearchRequest && count >= 3) {
      return res.status(429).json({ 
        text: "You've reached your maximum of 3 search requests this month. We do this to ensure every connection remains high-quality.",
        payload: { kind: 'text', text: "Quota reached" }
      });
    }

    // Pass email to check for professional profile context
    const aiResponse = await generateChatResponse(messages, email);
    
    // ATOMIC SAVE: ensure messages are saved to Supabase
    await saveChatTranscript(email, [...messages, { role: 'assistant', content: aiResponse.text, payload: aiResponse.payload }]);

    res.json(aiResponse);
  } catch (err) {
    console.error('Chat API Error:', err);
    res.status(500).json({ text: "I encountered an error saving our conversation. Please try again." });
  }
});

// 2. LINKEDIN INTELLIGENCE
app.post('/api/linkedin-profile', async (req, res) => {
  const { linkedinUrl, email } = req.body;
  
  try {
    const profile = await extractStructuredProfile(linkedinUrl);
    // In Supabase repo, we would have a function to update the user profile
    // For now we simulate success and save context
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract profile' });
  }
});

app.listen(PORT, () => {
  console.log(`Luminous Backend running at http://localhost:${PORT}`);
});
