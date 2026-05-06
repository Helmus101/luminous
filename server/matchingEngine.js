import { findBestMatches } from './repositories/supabaseRepository.js';

// SEMANTIC MATCHING ENGINE
export async function generateChatResponse(messages, email) {
  const lastUserMessage = messages[messages.length - 1].content.toLowerCase();

  // 1. MATCHING TRIGGER: User asks for mentor/search
  if (lastUserMessage.includes('search') || lastUserMessage.includes('match') || lastUserMessage.includes('mentor')) {
    
    // REALLY use the context: concatenate last few messages to understand the user's intent
    const context = messages.slice(-5).map(m => m.content).join(' ');
    
    // Call our Supabase repository to perform the semantic matching
    const bestMatches = await findBestMatches(context);

    if (!bestMatches || bestMatches.length === 0) {
      return {
        text: "I've searched our database using your context, but I couldn't find an exact match right now. Could you tell me more about the specific skills or industry you're interested in?",
        payload: { kind: 'text', text: "No matches found" }
      };
    }

    const candidates = bestMatches.map(m => ({
      id: m.id,
      name: m.name,
      reason: `Based on your interest in ${m.expertise?.slice(0, 2).join(', ')}, ${m.name}'s background in ${m.current_role_text} makes them a great fit.`,
      linkedinUrl: m.linkedin_url || `https://linkedin.com/in/${m.name.toLowerCase().replace(' ', '')}`
    }));

    return {
      text: "I've analyzed our mentor network against your professional background and goals. Here are the best matches I found for you:",
      payload: {
        kind: 'connection_started',
        title: "Top Matches",
        text: "Ranked by semantic alignment with your current trajectory.",
        candidates: candidates,
        queuedEmails: candidates.length,
        note: "You can select 3 mentors for introduction each month."
      }
    };
  }

  // 2. CONTEXT GATHERING: First response after name
  if (messages.length === 2) {
    return {
      text: `Nice to meet you! To help me find the best mentor for you, I'll need a bit more context. Do you have a LinkedIn URL I can analyze, or would you like to provide a summary of your career history?`,
      payload: {
        kind: 'upload_request',
        infoTitle: "Profile Context",
        infoBody: "I can extract relevant details from your LinkedIn profile or a chat history export."
      }
    };
  }

  // DEFAULT CONVERSATIONAL RESPONSE
  return {
    text: "I'm listening. The more you share about your challenges and goals, the better my matching algorithm will perform. What else should I know about what you're looking for?"
  };
}

export async function extractStructuredProfile(linkedinUrl) {
  // Simulate DeepSeek Extraction from LinkedIn
  return {
    skills: ['Strategic Planning', 'Leadership', 'Product Development'],
    industry: 'Technology',
    goals: ['Career transition', 'Leadership growth'],
    confidence: 'high'
  };
}
