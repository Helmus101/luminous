import axios from 'axios';
import dotenv from 'dotenv';
import { mentors } from './mentors.js';
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function callDeepSeek(messages) {
  if (!DEEPSEEK_API_KEY) {
    console.error('DeepSeek API Key missing');
    return null;
  }

  const mentorContext = mentors.map(m => `
Name: ${m.name}
Background: ${m.background}
Current Role: ${m.currentRole}
Expertise: ${m.expertise?.join(', ')}
Interests: ${m.interests?.join(', ')}
Goals: ${m.goals?.join(', ')}
Location: ${m.location}
Industries: ${m.industries?.join(', ')}
Linkedin: ${m.linkedinUrl}
`).join('\n---\n');

  const systemPrompt = `You are Luminous, a chat-first mentor matching assistant. 
Your goal is to help users find the right mentors in our network through a natural conversation.

Available Mentors:
${mentorContext}

Guidelines:
1. Be friendly, professional, and adaptive to the user's tone.
2. Collect information naturally: Name, student/professional status, background (LinkedIn if possible), and what they are looking for in a mentor.
3. Don't ask all questions at once. Keep it conversational.
4. When you have enough context, suggest 3 mentors who best fit their needs. 
5. When suggesting mentors, you MUST use the following JSON format for your entire response:
{
  "text": "Your conversational response here",
  "payload": {
    "kind": "candidates",
    "candidates": [
      {
        "name": "Mentor Name",
        "reason": "Explain WHY this mentor is a good fit based on the user's specific context",
        "linkedinUrl": "...",
        "description": "...",
        "location": "...",
        "expertise": ["...", "..."]
      }
    ],
    "goal": "candidates_shown"
  }
}
6. If you are just chatting and not yet suggesting mentors, use:
{
  "text": "Your conversational response here",
  "payload": {
    "kind": "text",
    "goal": "onboarding"
  }
}
7. If the user mentions they want to talk to a specific mentor you already suggested, acknowledge it and tell them I will set it up. 
Wait, actually, the system handles 'i want to talk to' or 'select_candidate:' specifically, so just stay conversational if they express interest.

ALWAYS respond with valid JSON.`;

  try {
    const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      response_format: { type: 'json_object' }
    }, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return JSON.parse(response.data.choices[0].message.content);
  } catch (error) {
    console.error('DeepSeek Error:', error.response?.data || error.message);
    return null;
  }
}

export async function generateChatResponse(messages, email) {
  const lastUserMsg = messages[messages.length - 1].content;
  const lowerUserMsg = lastUserMsg.toLowerCase();

  // 1. Handle special commands/actions (keeping this manual for reliability)
  if (lowerUserMsg.startsWith('select_candidate:') || lowerUserMsg.includes('i want to talk to')) {
    const candidateName = lastUserMsg.includes(':') 
      ? lastUserMsg.split(':')[1]?.trim() 
      : lastUserMsg.replace(/i want to talk to/i, '').trim();
    
    if (candidateName && candidateName.length < 50) {
      return {
        text: `Excellent choice. I'm sending an outreach email to ${candidateName} right now. Once they opt-in, I'll connect you both via a joint intro email. Check your inbox soon!`,
        payload: { kind: 'outreach_triggered', candidateName }
      };
    }
  }

  // 2. AI Adaptive Chat
  const aiResponse = await callDeepSeek(messages);
  if (aiResponse) {
    return aiResponse;
  }

  // 3. Fallback
  return { 
    text: "I'm having a bit of trouble connecting to my brain right now. Can you tell me more about what you're looking for?", 
    payload: { kind: 'text', goal: 'general' } 
  };
}
