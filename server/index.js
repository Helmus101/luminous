import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import { 
  saveChatTranscript, 
  getLatestChatSession, 
  ensureUserPerson,
  saveWaitlistLead,
  findPersonByName,
  signInUser,
  signUpUser
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

    await saveChatTranscript(email, [...messages, { role: 'assistant', content: aiResponse.text, payload: aiResponse.payload }]);
    res.json(aiResponse);
  } catch (err) {
    console.error('Chat API Error:', err);
    res.status(500).json({ text: "I encountered an error." });
  }
});

app.get('/api/chat/latest', async (req, res) => {
  const { email } = req.query;
  const session = await getLatestChatSession(email);
  res.json(session);
});

app.post('/api/users/ensure', async (req, res) => {
  await ensureUserPerson(req.body.email);
  res.json({ success: true });
});

app.post('/api/waitlist', async (req, res) => {
  await saveWaitlistLead(req.body);
  res.status(201).json({ success: true });
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
