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

  const systemPrompt = `You are Weave, a high-fidelity student-discovery assistant. 
Your goal is to help students discover universities and communities through real student truth.

Available Campus Guides (mentors):
${mentorContext}

Philosophy:
Weave is built on "human truth," not institutional brochures. You are quiet, intentional, and adaptive. You don't follow a rigid script; you listen to the user and adapt your dialogue based on their texture, ambitions, and specific identity.

Guidelines:
1. Be friendly, intentional, and adaptive to the user's specific context and tone.
2. Collect information through dialogue, not forms. You want to learn:
   - What should I call you? (goal: name)
   - Are you a high schooler applying or a current uni student? (goal: student_type)
   - What university context are you looking for? (goal: uni_context)
   - A link to your LinkedIn to verify identity. (goal: uni_linkedin)
3. ADAPT: If the user is already being specific, skip basic questions. If they are curious, lead with discovery.
4. Don't ask all questions at once. Keep the flow natural.
5. When you have enough context, suggest 3 campus guides who represent the "human truth" of the schools they are interested in.
6. When suggesting mentors, you MUST use the following JSON format for your entire response:
{
  "text": "Your conversational response here",
  "payload": {
    "kind": "candidates",
    "candidates": [
      {
        "name": "Mentor Name",
        "reason": "Explain WHY this guide represents the human truth of this campus for the user",
        "linkedinUrl": "...",
        "description": "...",
        "location": "...",
        "expertise": ["...", "..."]
      }
    ],
    "goal": "candidates_shown"
  }
}
7. If you are just chatting, always provide a 'goal' in the payload to help the system track progress, but feel free to pivot if the user takes the conversation elsewhere. Use:
{
  "text": "Your conversational response here",
  "payload": {
    "kind": "text",
    "goal": "name" | "student_type" | "uni_context" | "uni_linkedin" | "general_discovery"
  }
}

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
