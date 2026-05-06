import { mentors } from './mentors.js';

// 1. SEMANTIC AI MATCHING (DeepSeek Integration Simulation)
// In a production app, we would use embeddings or a re-ranking model.
// For now, we simulate "Semantic Compatibility" by scoring intent, skills, and industry.

export async function generateChatResponse(messages, email) {
  const lastUserMessage = messages[messages.length - 1].content.toLowerCase();

  // HEURISTIC: Check if user is asking for matches
  if (lastUserMessage.includes('search') || lastUserMessage.includes('match') || lastUserMessage.includes('mentor')) {
    
    // Simulate AI "Thinking" and Ranking
    const topMatches = mentors
      .map(m => {
        // Calculate semantic compatibility score
        let score = 0;
        if (lastUserMessage.includes(m.industry.toLowerCase())) score += 40;
        if (m.expertise.some(e => lastUserMessage.includes(e.toLowerCase()))) score += 30;
        // Random "Anthropomorphic" variance for human feel
        score += Math.floor(Math.random() * 20); 
        
        return { 
          name: m.name, 
          reason: `Highly compatible due to shared focus on ${m.industry} and your specific interest in AI Safety.`,
          linkedinUrl: `https://linkedin.com/in/${m.name.toLowerCase().replace(' ', '')}`,
          score 
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 2); // Return top 2 as per requirement

    return {
      text: "I've searched our network for the best suited people for you. Based on your background and what you're looking for, these two seem like perfect matches.",
      payload: {
        kind: 'connection_started',
        title: "Top Matches Found",
        text: "I've analyzed compatibility across industries, skills, and mentor availability.",
        candidates: topMatches,
        queuedEmails: 2,
        note: "Select someone to initiate a blinded outreach."
      }
    };
  }

  // GREETING & CONTEXT GATHERING
  if (messages.length === 2 && lastUserMessage.length > 0) {
    return {
      text: `Nice to meet you! To find the best mentor, I'll need to understand two things: what you do, and what you want to achieve. Do you have a LinkedIn profile I can analyze, or would you like to provide a quick summary of your career history?`,
      payload: {
        kind: 'upload_request',
        infoTitle: "Share your Context",
        infoBody: "I can extract your professional background from a LinkedIn link or a chat history export (Claude/ChatGPT)."
      }
    };
  }

  return {
    text: "Tell me more about the specific reason you want to connect with a mentor today. The more details I have, the better my matching algorithm performs."
  };
}

export async function extractStructuredProfile(linkedinUrl) {
  // Simulate DeepSeek extracting structured data from a URL
  // In reality: Fetch HTML -> Clean -> LLM Extract JSON
  return {
    skills: ['AI Safety', 'Product Design', 'Neural Networks'],
    industry: 'Technology',
    goals: ['Transition to AI research', 'Build a startup'],
    confidence: 'high'
  };
}
