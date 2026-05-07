/**
 * Luminous Adaptive Interrogation Engine (DeepSeek Powered)
 * Dynamically adjusts questions based on user goals, sentiment, and previous signals.
 */
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

export async function generateChatResponse(messages, email) {
  const lastMsg = messages[messages.length - 1].content;
  const lowerMsg = lastMsg.toLowerCase();
  const history = messages.map(m => m.content.toLowerCase()).join(' ');
  const rawHistory = messages.map(m => m.content).join('\n');
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);

  // 1. DYNAMIC INTENT DETECTOR
  const isCurrentStudent = history.includes('i go to') || history.includes('current student') || history.includes('already a student') || history.includes('university student') || history.includes('college student');
  const isProspective = history.includes('applying') || history.includes('high school') || history.includes('prospective') || history.includes('looking at');
  const hasName = userMessages.length > 0;
  const hasStudentType = isCurrentStudent || isProspective || history.includes('university') || history.includes('college');
  const universityName = extractUniversityName(rawHistory);
  const hasUniversityName = Boolean(universityName);
  const hasCampusVibe = /\b(vibe|personality|feels like|welcoming|exclusive|chaotic|calm|intense|chill|competitive)\b/i.test(rawHistory);
  const hasSocialDetail = /\b(weekend|friends|social|party|clubs|dating|belong|lonely|fomo)\b/i.test(rawHistory);
  const hasWellbeingDetail = /\b(stress|mental health|anxiety|thriving|surviving|pressure|support|counseling)\b/i.test(rawHistory);
  const hasAcademicDetail = /\b(classes|professor|workload|grades|major|homework|research|internship)\b/i.test(rawHistory);
  const hasPracticalDetail = /\b(housing|dorm|food|dining|safe|transport|campus|gym|library)\b/i.test(rawHistory);
  const hasRealityCheck = /\b(nobody tells|misconception|surprised|hidden|struggle|choose again|thrive|hate it|love it)\b/i.test(rawHistory);

  if (!hasName) {
    return {
      text: "Before we start, what should I call you?",
      payload: { kind: 'text', goal: 'name' }
    };
  }

  if (!hasStudentType) {
    return {
      text: "Got it. Are you in high school looking at universities, or are you currently at a university?",
      payload: { kind: 'text', goal: 'student_type' }
    };
  }

  if (isCurrentStudent && !hasUniversityName) {
    return {
      text: "Which university are you at? Include your year and major if you can. That helps me ask better questions and attach your context to the right campus profile.",
      payload: { kind: 'text', goal: 'student_university' }
    };
  }

  // 2. PERSONA & SENTIMENT
  const isCritical = lowerMsg.includes('hate') || lowerMsg.includes('toxic') || lowerMsg.includes('stress') || lowerMsg.includes('bad');
  const isPositive = lowerMsg.includes('love') || lowerMsg.includes('amazing') || lowerMsg.includes('great') || lowerMsg.includes('fun');

  // 3. ADAPTIVE LOGIC
  let systemPrompt = `You are Luminous, a high-end cultural intelligence agent for universities and mentor matching.
Start by identifying whether the user is a current university student or a high school/prospective student.

If the user is a current university student, your job is to gather student-voice intelligence for their university profile. Ask one focused question at a time. Build toward these fields:
- one-sentence school personality
- social life and weekend reality
- belonging, inclusivity, and how people make friends
- wellbeing, stress, support, and whether students are thriving or surviving
- academics, workload, professors, competition, and support
- practical livability: housing, food, safety, transport, third spaces
- reality checks: misconceptions, hidden truths, who thrives, who struggles, would they choose again

If the user is a high school/prospective student, switch to the matching flow: ask who they want to find, why now, what type of person would be useful, and what bad match to avoid.

Style: minimalist, human, short. Never ask a giant survey. Ask the next highest-information question.`;
  
  if (isCurrentStudent) {
    systemPrompt += ` The user is a current student at ${universityName || 'a university'}. Prioritize campus experience collection before mentor matching.`;
  } else if (isProspective) {
    systemPrompt += " Goal: Help the student navigate the cultural minefield of top universities. Be a mentor with insider info.";
  }

  // Fallback to local logic if DeepSeek isn't configured, but prioritize DeepSeek
  if (DEEPSEEK_API_KEY) {
    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        temperature: 0.7
      }, {
        headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` }
      });

      return {
        text: response.data.choices[0].message.content,
        payload: { kind: 'text', provider: 'deepseek' }
      };
    } catch (err) {
      console.error("DeepSeek API Error:", err.message);
      // Fallback below
    }
  }

  // --- ADAPTIVE FALLBACK LOGIC ---
  if (isCurrentStudent) {
    if (!hasCampusVibe) {
      return {
        text: `For ${universityName || 'your school'}, give me the one honest sentence version: if this university were a person, what would their personality be like?`,
        payload: { kind: 'text', goal: 'campus_vibe' }
      };
    }
    if (!hasSocialDetail) {
      return {
        text: "Now give me the weekend reality. What do people actually do from Thursday night to Sunday, and how easy is it to find your people?",
        payload: { kind: 'text', goal: 'social_life' }
      };
    }
    if (!hasWellbeingDetail) {
      return {
        text: "On the spectrum from thriving to surviving, where are students really? What creates the most stress, and where do people go if they need help?",
        payload: { kind: 'text', goal: 'wellbeing' }
      };
    }
    if (!hasAcademicDetail) {
      return {
        text: "What does the academic experience feel like day to day: professors, workload, grading, competition, and support when someone is struggling?",
        payload: { kind: 'text', goal: 'academics' }
      };
    }
    if (!hasPracticalDetail) {
      return {
        text: "What is daily life actually like: housing, food, safety, places to hang out, and whether campus feels livable?",
        payload: { kind: 'text', goal: 'practical_life' }
      };
    }
    if (!hasRealityCheck) {
      return {
        text: "Final real-talk pass: what is the biggest thing nobody tells applicants, who thrives there, and who would probably struggle?",
        payload: { kind: 'text', goal: 'reality_check' }
      };
    }
    if (isCritical && !history.includes('stress')) {
      return {
        text: "I hear the frustration. That 'toxic' pressure is exactly what prospectives need to know about. On a scale of 1-10, how much of that is the school's culture vs. just the workload? Does the 'Duck Syndrome' make it worse?",
        payload: { kind: 'text', goal: 'emotional_temp', sentiment: 'critical' }
      };
    }
    if (isPositive && !history.includes('weekend')) {
      return {
        text: "It sounds like you've found your tribe. To pressure-test that for others: what does the social matrix look like for people who *don't* fit the main mold? Is the weekend vibe inclusive, or do you have to be in a specific circle?",
        payload: { kind: 'text', goal: 'social_matrix', sentiment: 'positive' }
      };
    }
    if (!history.includes('actually like') && !history.includes('personality')) {
      return {
        text: "Let's skip the brochure talk. If your university was a person at a party, how would they act? Are they the overachiever in the corner or the life of the room?",
        payload: { kind: 'text', goal: 'personality_mapping' }
      };
    }
    return {
      text: "This is the kind of student voice the profile needs. I saved it to your context and the campus intelligence queue. If you want, we can now switch to matching: who would you want Luminous to find for you?",
      payload: { kind: 'text', goal: 'campus_context_complete' }
    };
  }

  if (isProspective) {
    const targetUni = lowerMsg.includes('stanford') ? 'Stanford' : lowerMsg.includes('upenn') ? 'UPenn' : lowerMsg.includes('berkeley') ? 'Berkeley' : null;
    if (!targetUni) {
      return {
        text: "I'm ready to dive deep. Which campuses are on your shortlist? I'll pull the latest 'student-verified' signals for you.",
        payload: { kind: 'text', goal: 'target_selection' }
      };
    }
    return {
      text: `Got it, ${targetUni}. Current students there are reporting shifts in the 'Social Matrix'. Do you want the data on the FOMO factor, or the raw truth about the Housing reality?`,
      payload: { kind: 'text', goal: 'social_deep_dive', target: targetUni }
    };
  }

  return {
    text: "I'm Luminous, your cultural intelligence engine. Are you a current student here to drop signals, or a prospective looking for the unfiltered truth?",
    payload: { kind: 'text', goal: 'onboarding' }
  };
}

function extractUniversityName(text) {
  const match = text.match(/\b(?:i go to|i study at|i'm at|i am at|my university is|my college is)\s+([A-Z][A-Za-z&.\-\s]{2,60})/i)
    || text.match(/\b([A-Z][A-Za-z&.\-\s]{2,45}\s+(?:University|College|School|Institute))\b/);
  return match?.[1]?.replace(/[.?!,].*$/, '').trim() || null;
}

export async function extractStructuredProfile(linkedinUrl) {
  return {
    name: "Extracted User",
    headline: "Professional at Startup",
    experience: ["Founder at Stealth", "Software Engineer at Google"],
    education: "Stanford University"
  };
}
