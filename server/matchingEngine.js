import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function generateChatResponse(messages, email) {
  const lastMsg = messages[messages.length - 1].content;
  const lowerMsg = lastMsg.toLowerCase();
  
  if (lowerMsg.startsWith('select_candidate:') || lowerMsg.includes('i want to talk to')) {
    const candidateName = lastMsg.split(':')[1]?.trim() || lastMsg.replace('SELECT_CANDIDATE:', '').trim();
    return {
      text: "Excellent choice. I'm sending an outreach email to " + candidateName + " right now. Once they opt-in, I'll connect you both via a joint intro email. Check your inbox soon!",
      payload: { kind: 'outreach_triggered', candidateName }
    };
  }

  const history = messages.map(m => m.content.toLowerCase()).join(' ');
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);

  const isCurrentStudent = history.includes('i go to') || history.includes('current student');
  const isProspective = history.includes('applying') || history.includes('high school');
  const hasName = userMessages.length > 0;
  const hasStudentType = isCurrentStudent || isProspective;

  if (!hasName) {
    return { text: 'Before we start, what should I call you?', payload: { kind: 'text', goal: 'name' } };
  }

  if (!hasStudentType) {
    return { text: 'Are you in high school looking at universities, or are you currently at a university?', payload: { kind: 'text', goal: 'student_type' } };
  }

  if (isProspective && (lowerMsg.includes('match') || lowerMsg.includes('find'))) {
    return {
      text: 'Here are 3 people who match your goals:',
      payload: { 
        kind: 'candidates', 
        candidates: [
          { name: 'Alex Chen', reason: '3rd year at Stanford.', linkedinUrl: '#' },
          { name: 'Sarah Miller', reason: 'Senior at UPenn.', linkedinUrl: '#' },
          { name: 'Jordan Wu', reason: 'Graduate at Berkeley.', linkedinUrl: '#' }
        ]
      }
    };
  }

  return { text: 'I am Weave. How can I help?', payload: { kind: 'text', goal: 'general' } };
}

export async function extractStructuredProfile(linkedinUrl) {
  return { name: 'Extracted', headline: 'Founder', experience: [], education: '' };
}
