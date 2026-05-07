import axios from 'axios';
import dotenv from 'dotenv';
import { mentors } from './mentors.js';
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function generateChatResponse(messages, email) {
  const lastMsg = messages[messages.length - 1].content;
  const lowerMsg = lastMsg.toLowerCase();
  
  if (lowerMsg.startsWith('select_candidate:') || lowerMsg.includes('i want to talk to')) {
    // Check if it's a specific university request from Discovery
    const uniMatch = lastMsg.match(/i want to talk to someone at (.+)/i);
    if (uniMatch && !lowerMsg.startsWith('select_candidate:')) {
      const university = uniMatch[1].trim();
      const candidates = mentors.filter(m => 
        m.background.toLowerCase().includes(university.toLowerCase()) ||
        m.location.toLowerCase().includes(university.toLowerCase())
      ).slice(0, 3);

      if (candidates.length > 0) {
        return {
          text: `I've found some students and alumni from ${university} who might be able to help. Who would you like to speak with?`,
          payload: { 
            kind: 'candidates', 
            candidates: candidates.map(c => ({
              name: c.name,
              reason: c.background,
              linkedinUrl: c.linkedinUrl,
              description: c.goals[0]
            }))
          }
        };
      } else {
        return {
          text: `I'd love to help you connect with someone at ${university}. Tell me a bit more about what you're looking for there?`,
          payload: { kind: 'text', goal: 'hs_vibe' }
        };
      }
    }

    const candidateName = lastMsg.split(':')[1]?.trim() || lastMsg.replace('SELECT_CANDIDATE:', '').trim();
    return {
      text: "Excellent choice. I'm sending an outreach email to " + candidateName + " right now. Once they opt-in, I'll connect you both via a joint intro email. Check your inbox soon!",
      payload: { kind: 'outreach_triggered', candidateName }
    };
  }

  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase());
  
  // Simple state machine based on history
  const hasName = userMessages.length > 0;
  const studentTypeMsg = userMessages.find(m => m.includes('high school') || m.includes('university') || m.includes('college') || m.includes('student'));
  const isHS = studentTypeMsg && (studentTypeMsg.includes('high school') || studentTypeMsg.includes('prospective'));
  const isUni = studentTypeMsg && (studentTypeMsg.includes('university') || studentTypeMsg.includes('college') || studentTypeMsg.includes('current student'));

  if (!hasName) {
    return { text: 'Before we start, what should I call you?', payload: { kind: 'text', goal: 'name' } };
  }

  if (!studentTypeMsg) {
    return { text: 'Nice to meet you! Are you in high school looking at universities, or are you currently at a university?', payload: { kind: 'text', goal: 'student_type' } };
  }

  if (isHS) {
    // High School Path
    const vibeKeywords = ['vibe', 'social', 'stress', 'culture', 'feel', 'like', 'belong'];
    const hasTalkedAboutVibe = userMessages.some(m => vibeKeywords.some(k => m.includes(k)));

    if (!hasTalkedAboutVibe) {
      return { 
        text: "Discovery at Weave is about 'human truth.' What kind of university vibe are you looking for? (e.g., Are you looking for a high-pressure academic environment, or something more socially balanced?)", 
        payload: { kind: 'text', goal: 'hs_vibe' } 
      };
    }

    // Generate matches based on some keywords or just return default ones if no specific uni mentioned
    const matches = mentors.slice(0, 3); // In a real app, this would be filtered
    return {
      text: 'Based on what you\'re looking for, these students might have the perspective you need:',
      payload: { 
        kind: 'candidates', 
        candidates: matches.map(c => ({
          name: c.name,
          reason: c.background,
          linkedinUrl: c.linkedinUrl,
          description: c.goals[0]
        }))
      }
    };
  }

  if (isUni) {
    // University Path
    const goalKeywords = ['mentor', 'meet', 'peers', 'help', 'network'];
    const hasTalkedAboutGoal = userMessages.some(m => goalKeywords.some(k => m.includes(k)));

    if (!hasTalkedAboutGoal) {
      return { 
        text: "Great. At university, Weave is about contribution. Do you want to mentor prospective students, or are you looking to meet peers in your field?", 
        payload: { kind: 'text', goal: 'uni_goal' } 
      };
    }

    const contextKeywords = ['major', 'study', 'at', 'university', 'college'];
    const hasTalkedAboutContext = userMessages.some(m => contextKeywords.some(k => m.includes(k)));

    if (!hasTalkedAboutContext) {
      return { 
        text: "Got it. And which university are you at, and what are you studying?", 
        payload: { kind: 'text', goal: 'uni_context' } 
      };
    }

    return { 
      text: "Thanks for sharing that. I've updated your profile. I'll reach out when I have a relevant match or a student who needs your perspective.", 
      payload: { kind: 'text', goal: 'general' } 
    };
  }

  return { text: 'I am Weave. How can I help you find your place or your people today?', payload: { kind: 'text', goal: 'general' } };
}

export async function extractStructuredProfile(linkedinUrl) {
  return { name: 'Extracted', headline: 'Founder', experience: [], education: '' };
}
