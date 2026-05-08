import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { 
  saveChatTranscript, 
  getLatestChatSession, 
  ensureUserPerson,
  getPersonByEmail,
  saveWaitlistLead,
  findPersonByName,
  signInUser,
  signUpUser,
  deleteAllChatHistory
} from './repositories/supabaseRepository.js';
import { generateChatResponse } from './matchingEngine.js';
import { sendOutreachEmail } from './mailer.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

app.post('/api/chat', async (req, res) => {
  const { messages, email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const aiResponse = await generateChatResponse(messages, email);
    
    // Handle special actions
    if (aiResponse.payload?.kind === 'outreach_triggered') {
      const candidateName = aiResponse.payload.candidateName;
      const person = await findPersonByName(candidateName);
      if (person && person.contact_email) {
        await sendOutreachEmail(person.contact_email, email);
      }
    }

    await saveChatTranscript(
      email, 
      [...messages, { id: randomUUID(), role: 'assistant', content: aiResponse.text, payload: aiResponse.payload }],
      aiResponse.payload?.extracted_context
    );
    res.json(aiResponse);
  } catch (err) {
    console.error('Chat API Error:', err);
    res.status(500).json({ text: "I encountered an error." });
  }
});

app.get('/api/chat/latest', async (req, res) => {
  const { email } = req.query;
  const session = await getLatestChatSession(email);
  
  if (session.messages.length === 0) {
    const person = await getPersonByEmail(email);
    if (person && person.name) {
      session.messages = [{
        id: 'welcome',
        role: 'assistant',
        content: `Welcome back, ${person.name}. I've missed our conversations. What's on your mind regarding your campus journey?`,
        payload: { kind: 'text', goal: 'general_discovery' }
      }];
    }
  }
  
  res.json(session || { messages: [] });
});

app.post('/api/chat/clear', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  await deleteAllChatHistory(email);
  res.json({ success: true });
});

app.post('/api/users/ensure', async (req, res) => {
  await ensureUserPerson(req.body.email);
  res.json({ success: true });
});

app.post('/api/waitlist', async (req, res) => {
  try {
    await saveWaitlistLead(req.body);
    res.status(201).json({ success: true });
  } catch (error) {
    console.error('Waitlist API Error:', error);
    res.status(500).json({ error: 'Failed to save waitlist lead' });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  const result = await signInUser(email, password);
  if (result.error) return res.status(401).json({ error: result.error });
  res.json({ success: true, email });
});

app.listen(PORT, () => {
  console.log(`Luminous Backend running at http://localhost:${PORT}`);
});
