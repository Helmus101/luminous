import axios from 'axios';
import dotenv from 'dotenv';
import { mentors } from './mentors.js';
import campusProfiles from './campusData.js';
import { getPersonByEmail } from './repositories/supabaseRepository.js';

dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

async function callDeepSeek(messages, userProfile = null) {
  if (!DEEPSEEK_API_KEY) {
    console.error('DeepSeek API Key missing');
    return null;
  }

  const mentorContext = mentors.map(m => `
Name: ${m.name}
Background: ${m.background}
Current Role: ${m.currentRole}
Expertise: ${m.expertise?.join(', ')}
Location: ${m.location}
Industries: ${m.industries?.join(', ')}
`).join('\n---\n');

  const campusContext = campusProfiles.map(c => `
University: ${c.name}
Vibe: ${c.vibe}
Personality: ${c.personality}
Stress Level: ${c.stress_level}
Student Quote: ${c.student_quote}
Misconception: ${c.misconception}
`).join('\n---\n');

  const profileContext = userProfile ? `
CURRENT USER PROFILE (already known):
Name: ${userProfile.name || 'Unknown'}
Student Type: ${userProfile.profile_json?.studentType || 'Unknown'}
University: ${userProfile.profile_json?.university || 'None'}
Interests: ${userProfile.profile_json?.interests?.join(', ') || 'None'}
LinkedIn: ${userProfile.linkedin_url || 'None'}
` : '';

  const systemPrompt = `You are Weave, a high-fidelity student-discovery assistant. 
Your goal is to help students discover universities and communities through real student truth.

${profileContext}

Available Campus Intelligence (Human Truth):
${campusContext}

Available Campus Guides (Mentors):
${mentorContext}

Philosophy:
Weave is built on "human truth," not institutional brochures. You are quiet, intentional, and adaptive. You don't follow a rigid script; you listen to the user and adapt your dialogue based on their texture, ambitions, and specific identity.

Flows:
1. HIGH SCHOOL (Applicant) FLOW:
   - Goal: Discover the "human truth" of campuses. 
   - Ask about their interests, what they value in a community, and what they've heard about certain schools.
   - Share specific insights from the Campus Intelligence above.
   - Match them with Campus Guides who can tell the real story.

2. UNIVERSITY (Guide/Contributor) FLOW:
   - Goal: Contribute campus intelligence and act as a guide.
   - Ask about their experience at their university. What's the real stress level? What's a common misconception?
   - Validate their experience and see if they want to help high schoolers navigate their school.

Guidelines:
1. Be friendly, intentional, and adaptive.
2. ADAPT: If the user is already being specific, skip basic questions. If they are curious, lead with discovery.
3. Don't ask all questions at once. Keep the flow natural.
4. Always try to extract the following context if missing: name, student_type (high_school_student or university_student), university (if applicable), interests, and linkedin_url.

Structured Output:
You MUST respond with the following JSON format:
{
  "text": "Your conversational response here",
  "payload": {
    "kind": "text" | "candidates" | "discovery",
    "goal": "name" | "student_type" | "university" | "interests" | "linkedin" | "discovery_shown",
    "extracted_context": {
      "name": "...",
      "student_type": "high_school_student" | "university_student",
      "university": "...",
      "interests": ["...", "..."],
      "linkedin_url": "..."
    },
    "candidates": [ ... optional list of mentors ... ]
  }
}

Include the 'extracted_context' in EVERY response. Only fill fields you are confident about based on the entire conversation.`;

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

  // 1. Handle special commands/actions
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

  // 2. Fetch User Profile
  const userProfile = await getPersonByEmail(email);

  // 3. AI Adaptive Chat
  const aiResponse = await callDeepSeek(messages, userProfile);
  if (aiResponse) {
    return aiResponse;
  }

  // 4. Fallback
  return { 
    text: "I'm having a bit of trouble connecting to my brain right now. Can you tell me more about what you're looking for?", 
    payload: { kind: 'text', goal: 'general' } 
  };
}
