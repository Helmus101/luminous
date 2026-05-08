import axios from 'axios';
import dotenv from 'dotenv';
import { mentors } from './mentors.js';
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function generateChatResponse(messages, email) {
  const lastUserMsg = messages[messages.length - 1].content;
  const lowerUserMsg = lastUserMsg.toLowerCase();

  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const lastAssistantMsg = assistantMessages[assistantMessages.length - 1];
  const currentGoal = lastAssistantMsg?.payload?.goal;

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

  // 2. State Machine Onboarding
  if (currentGoal === 'name') {
    return { 
      text: `Nice to meet you, ${lastUserMsg}! Are you in high school looking at universities, or are you currently at a university?`, 
      payload: { kind: 'text', goal: 'student_type' } 
    };
  }

  if (currentGoal === 'student_type') {
    if (lowerUserMsg.includes('high school') || lowerUserMsg.includes('prospective')) {
      return {
        text: "I'd love to help you find the right people. To get started, could you share your LinkedIn URL?",
        payload: { kind: 'text', goal: 'hs_linkedin' }
      };
    } else {
      return {
        text: "Great. At university, Weave is about contribution. Do you want to mentor prospective students, or are you looking to meet peers in your field?",
        payload: { kind: 'text', goal: 'uni_goal' }
      };
    }
  }

  // HS Path
  if (currentGoal === 'hs_linkedin') {
    return {
      text: "Thanks! Now, please paste this prompt into an LLM (like ChatGPT or Claude) and then paste the result here: 'Based on my LinkedIn profile, what are my core interests and what kind of mentor would best help me navigate university choices?'",
      payload: { kind: 'text', goal: 'hs_llm_prompt' }
    };
  }

  if (currentGoal === 'hs_llm_prompt') {
    return {
      text: "Got it. Now, tell me who you are looking for? Not just which university, but what kind of person? What are their interests, their background, or their vibe? Please be as specific as possible!",
      payload: { kind: 'text', goal: 'hs_search_who' }
    };
  }

  if (currentGoal === 'hs_search_who') {
    return {
      text: "That's helpful. To be even more specific: what specific industries or fields of study are you most interested in exploring with a mentor?",
      payload: { kind: 'text', goal: 'hs_interests' }
    };
  }

  if (currentGoal === 'hs_interests') {
    return {
      text: "Got it. And what's one thing about your future university experience that you're most curious or nervous about?",
      payload: { kind: 'text', goal: 'hs_vibe' }
    };
  }

  if (currentGoal === 'hs_vibe') {
    const context = messages.map(m => m.content).join(' ').toLowerCase();
    const matches = mentors.filter(m => {
      const expertiseMatch = m.expertise?.some(e => context.includes(e.toLowerCase()));
      const backgroundMatch = m.background?.toLowerCase().split(' ').some(word => word.length > 3 && context.includes(word));
      const goalMatch = m.goals?.some(g => context.includes(g.toLowerCase()));
      return expertiseMatch || backgroundMatch || goalMatch;
    }).slice(0, 3);
    
    const displayMatches = matches.length > 0 ? matches : mentors.slice(0, 3);
    const responseText = matches.length > 0 
      ? `Based on everything you've shared, these mentors might have the perspective you need:`
      : `I've noted your preferences. While I don't have a perfect match yet, these mentors have great perspectives that might help:`;

    return {
      text: responseText,
      payload: {
        kind: 'candidates',
        candidates: displayMatches.map(m => ({
          name: m.name,
          reason: m.background,
          linkedinUrl: m.linkedinUrl,
          description: m.goals[0],
          location: m.location,
          expertise: m.expertise
        })),
        goal: 'candidates_shown'
      }
    };
  }

  // Uni Path
  if (currentGoal === 'uni_goal') {
    return {
      text: "Got it. And which university are you at, and what are you studying?",
      payload: { kind: 'text', goal: 'uni_context' }
    };
  }

  if (currentGoal === 'uni_context') {
    return {
      text: "To help me match you better, could you share your LinkedIn URL?",
      payload: { kind: 'text', goal: 'uni_linkedin' }
    };
  }

  if (currentGoal === 'uni_linkedin') {
    const profile = await extractStructuredProfile(lastUserMsg);
    return {
      text: `Thanks! I've extracted some details. To give me even more context, could you paste your LinkedIn 'About' section or a brief summary of your background?`,
      payload: { kind: 'text', goal: 'uni_context_paste' }
    };
  }

  if (currentGoal === 'uni_context_paste') {
    return {
      text: "Thanks for sharing that! I've updated your profile with all this context. I'll reach out when I have a relevant match or a student who needs your perspective.",
      payload: { kind: 'text', goal: 'general' }
    };
  }

  // Default Fallback
  return { 
    text: "I'm here to help you find your place or your people. How can I assist you today?", 
    payload: { kind: 'text', goal: 'general' } 
  };
}

export async function extractStructuredProfile(linkedinUrl) {
  if (!linkedinUrl || !linkedinUrl.includes('linkedin.com')) return null;
  return { 
    name: 'Alex Johnson', 
    headline: 'Computer Science Student at Stanford', 
    experience: ['Intern at Google', 'Research Assistant'], 
    education: 'Stanford University',
    skills: ['React', 'TypeScript', 'AI']
  };
}
