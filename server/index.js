import express from 'express'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mentors } from './mentors.js'
import {
  createConnectionRequest,
  ensurePeopleSeeded,
  getLatestChat,
  getMockOutbox,
  getNetworkPeople,
  getRepositorySnapshot,
  getSearchQuota,
  getUserByAccessToken,
  recordConsentDecision,
  saveChatTranscript,
  saveProfileImport,
  selectCandidateForRequest,
  signInWithPassword,
  signUpWithPassword,
  updateUserName,
} from './repositories/supabaseRepository.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

loadLocalEnv()

const app = express()
const port = Number(process.env.PORT || 8787)

app.use(express.json({ limit: '1mb' }))

app.get('/api/meta', async (_req, res) => {
  const networkPeople = await getNetworkPeople()
  res.json({
    personCount: networkPeople.filter((person) => person.willingToMentor).length,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    mode: process.env.DEEPSEEK_API_KEY ? 'live' : 'mock',
    dataBackend: 'supabase',
    repository: await getRepositorySnapshot(),
  })
})

app.get('/api/quota', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const quota = await getSearchQuota(authUser.email)
  res.json({ quota })
})

app.post('/api/auth/signup', async (req, res) => {
  const email = sanitizeEmail(req.body?.email)
  const password = sanitizePassword(req.body?.password)
  const initialQuery = String(req.body?.initialQuery || '').trim().slice(0, 1200)

  if (!email || !password) {
    return res.status(400).json({ message: 'Use a valid email and a password with at least 8 characters.' })
  }

  try {
    const auth = await signUpWithPassword({ email, password, initialQuery })
    res.status(201).json(auth)
  } catch (error) {
    res.status(400).json({ message: humanizeAuthError(error, 'Could not create that account.') })
  }
})

app.post('/api/auth/signin', async (req, res) => {
  const email = sanitizeEmail(req.body?.email)
  const password = sanitizePassword(req.body?.password)
  const initialQuery = String(req.body?.initialQuery || '').trim().slice(0, 1200)

  if (!email || !password) {
    return res.status(400).json({ message: 'Enter your email and password.' })
  }

  try {
    const auth = await signInWithPassword({ email, password, initialQuery })
    res.json(auth)
  } catch (error) {
    res.status(401).json({ message: humanizeAuthError(error, 'Invalid email or password.') })
  }
})

app.patch('/api/user-profile', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const fullName = String(req.body?.fullName || '').trim().slice(0, 160)
  if (fullName.length < 2) {
    return res.status(400).json({ message: 'Send your name so Luminous knows what to call you.' })
  }

  try {
    const profile = await updateUserName({
      email: authUser.email,
      authUserId: authUser.id,
      fullName,
    })

    res.json({ profile })
  } catch (error) {
    console.error('Name update failed:', error)
    res.status(500).json({
      message: 'Could not save your name. Run migration 005_user_names.sql in Supabase, then try again.',
    })
  }
})

app.get('/api/chat/latest', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const chat = await getLatestChat({ email: authUser.email, authUserId: authUser.id })
  res.json({ chat })
})

app.post('/api/chat', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const messages = sanitizeMessages(req.body?.messages)
  const chatSessionId = String(req.body?.chatSessionId || '').trim().slice(0, 120) || null
  const initialQuery = String(req.body?.initialQuery || '').trim().slice(0, 1200)
  const userName = String(req.body?.userName || authUser.firstName || '').trim().slice(0, 80)
  const flowStage = String(req.body?.flowStage || 'name').trim().slice(0, 40)

  if (messages.length === 0) {
    return res.status(400).json({ message: 'Send at least one message.' })
  }

  const payload = await getAssistantPayload({ messages, userName, flowStage, initialQuery })
  const saved = await saveChatTranscript({
    email: authUser.email,
    authUserId: authUser.id,
    sessionId: chatSessionId,
    initialQuery,
    messages: [...messages, payloadToSavedAssistantMessage(payload)],
  })

  res.json({ message: payload, chatSessionId: saved.sessionId })
})

app.post('/api/profile-import', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const source = String(req.body?.source || 'AI history').trim().slice(0, 80)
  const fileName = String(req.body?.fileName || 'uploaded export').trim().slice(0, 220)
  const contentSnippet = String(req.body?.contentSnippet || '').trim().slice(0, 8000)
  const messages = sanitizeMessages(req.body?.messages)

  if (!contentSnippet) {
    return res.status(400).json({ message: 'Upload a readable ChatGPT or Claude export, or paste a summary.' })
  }

  const generatedProfile = extractProfile({
    source,
    contentSnippet,
    messages,
    initialQuery: String(req.body?.initialQuery || ''),
  })
  const record = await saveProfileImport({
    email: authUser.email,
    source,
    fileName,
    generatedProfile,
    snippetLength: contentSnippet.length,
  })

  res.status(201).json({ import: record, generatedProfile })
})

app.post('/api/linkedin-profile', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const linkedinUrl = String(req.body?.linkedinUrl || '').trim().slice(0, 500)
  if (!looksLikeLinkedinUrl(linkedinUrl)) {
    return res.status(400).json({ message: 'Paste a valid LinkedIn profile URL.' })
  }

  res.json({ profile: buildMockLinkedinProfile(linkedinUrl), mode: 'mock_linkedin_extract' })
})

app.post('/api/connection-request', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const quota = await getSearchQuota(authUser.email)
  if (quota.remaining <= 0) {
    return res.status(429).json({
      message: 'You have used your 3 Luminous searches for this month.',
      quota,
    })
  }

  const messages = sanitizeMessages(req.body?.messages)
  const linkedinUrl = String(req.body?.linkedinUrl || '').trim().slice(0, 500)
  const linkedinProfile = sanitizeLinkedinProfile(req.body?.linkedinProfile)
  const generatedProfile = req.body?.generatedProfile || extractProfile({ messages, contentSnippet: '', source: 'chat' })
  const people = await getNetworkPeople()

  const candidates = await rankCandidatesWithDeepSeek({
    profile: generatedProfile,
    messages,
    people,
  })

  const { request, queuedEmails, candidates: publicCandidates } = await createConnectionRequest({
    email: authUser.email,
    linkedinUrl,
    linkedinProfile,
    generatedProfile,
    messages,
    candidates,
  })

  res.status(201).json({
    status: 'queued',
    queuedEmails,
    requestId: request.id,
    quota: await getSearchQuota(authUser.email),
    candidates: publicCandidates,
    topScores: publicCandidates.map((candidate) => candidate.score),
  })
})

app.post('/api/match-requests/:requestId/select-candidate', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const requestId = String(req.params.requestId || '').trim().slice(0, 120)
  const candidateId = String(req.body?.candidateId || '').trim().slice(0, 120)
  if (!requestId || !candidateId) {
    return res.status(400).json({ message: 'Choose one candidate for this search.' })
  }

  try {
    const selection = await selectCandidateForRequest({
      email: authUser.email,
      requestId,
      candidateId,
    })
    res.status(201).json({
      status: 'candidate_contacted',
      message: `I've queued outreach to ${selection.candidate.name}. I'll let you know if they're interested.`,
      selection,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not select that candidate.'
    res.status(409).json({
      message: message.includes('selected_candidate_id') || message.includes('email_stage')
        ? 'Run migration 006_candidate_selection.sql in Supabase, then restart the API and try selecting again.'
        : message,
    })
  }
})

app.get('/api/mock-outbox/:requestId', async (req, res) => {
  const authUser = await requireAuth(req, res)
  if (!authUser) return

  const outbox = await getMockOutbox(String(req.params.requestId || '').slice(0, 120))
  res.json(outbox)
})

app.post('/api/consent/:emailId/respond', async (req, res) => {
  const decision = req.body?.decision === 'accepted' ? 'accepted' : 'declined'
  const result = await recordConsentDecision({
    emailId: String(req.params.emailId || '').slice(0, 180),
    decision,
  })

  if (!result) {
    return res.status(404).json({ message: 'That mock consent email does not exist.' })
  }

  res.json({ status: result.requestStatus, connectionCreated: result.connectionCreated })
})

const distDir = join(rootDir, 'dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((_req, res) => res.sendFile(join(distDir, 'index.html')))
}

app.listen(port, () => {
  console.log(`Luminous API listening on http://localhost:${port}`)
})

ensurePeopleSeeded()
  .then((result) => {
    if (result.seeded) console.log(`Seeded ${result.count} Luminous mock profiles into Supabase`)
  })
  .catch((error) => console.error('Supabase seed failed:', error))

/**
 * Main chat orchestrator - uses DeepSeek when available, falls back to deterministic
 */
async function getAssistantPayload({ messages, userName, flowStage, initialQuery }) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'

  if (!apiKey) {
    return buildDeterministicChatResponse(messages, userName, flowStage)
  }

  try {
    const systemPrompt = buildSystemPrompt(userName, flowStage)
    const conversation = buildConversationForDeepSeek(messages, flowStage, initialQuery)

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 600,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...conversation,
        ],
      }),
    })

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status, await response.text())
      return buildDeterministicChatResponse(messages, userName, flowStage)
    }

    const completion = await response.json()
    const content = completion?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
      return buildDeterministicChatResponse(messages, userName, flowStage)
    }

    const payload = normalizePayloadFromText(content)
    return isEmptyPayload(payload) ? buildDeterministicChatResponse(messages, userName, flowStage) : payload
  } catch (error) {
    console.error('DeepSeek chat failed, using deterministic fallback:', error)
    return buildDeterministicChatResponse(messages, userName, flowStage)
  }
}

/**
 * Anthropomorphic flow system prompt
 * Follows: Name -> Goal -> Specifics -> LinkedIn -> AI History -> Search
 */
function buildSystemPrompt(userName, flowStage) {
  const name = userName || 'there'
  return `You are Luminous, a warm and professional private matching agent. You guide users through finding the right mentor or connection through a structured conversation.

Return JSON only in one of these forms:
{"kind":"text","text":"Message"}
{"kind":"upload_request","text":"Message","infoTitle":"Title","infoBody":"Body"}

ANTHROPOMORPHIC FLOW - Follow this sequence strictly:

1. NAME (if not known): Ask for their name warmly. "Before we start, what should I call you?"
2. GOAL: Once you know their name, ask about the connection they want. "Who do you want to find, ${name}, and what would make this connection useful?"
3. SPECIFICS: Clarify the person-shape with one focused question. Ask about: role, industry, location, background, or constraint.
4. LINKEDIN: Ask for their LinkedIn or say "no LinkedIn" if they don't have one. "Do you have a LinkedIn profile I should use as context?"
5. AI HISTORY: After LinkedIn context (or skipping it), offer AI history export for richer matching. "To get the best results, upload your ChatGPT or Claude export. Otherwise, say 'continue without'."
6. SEARCH: Once enough context is gathered, the system will run the search automatically.

RULES:
- Ask only ONE question at a time. Be concise.
- Address the user as ${name} when speaking naturally.
- Never reveal candidates in chat.
- When the user has enough context (LinkedIn + specifics OR just the goal), send upload_request.
- Speak professionally but warmly. This is a premium matching service.
- If user says "no LinkedIn" or similar, acknowledge and move to AI history step.
- If user says "skip" or "continue without", send the upload_request with "continue without" acknowledged.`
}

/**
 * Build conversation context for DeepSeek with flow awareness
 */
function buildConversationForDeepSeek(messages, flowStage, initialQuery) {
  const userMessages = messages.filter(m => m.role === 'user')
  const lastUserMessage = userMessages[userMessages.length - 1]?.content || ''
  const combined = messages.map(m => m.content).join(' ').toLowerCase()

  const systemContext = []
  if (flowStage === 'name' && userMessages.length === 0) {
    systemContext.push({ role: 'system', content: 'STAGE: Name - Ask for their name first.' })
  } else if (flowStage === 'goal') {
    systemContext.push({ role: 'system', content: 'STAGE: Goal - User has shared their initial goal. Ask clarifying question about the person they want to find.' })
  } else if (flowStage === 'specifics') {
    systemContext.push({ role: 'system', content: 'STAGE: Specifics - Ask for more detail about the ideal mentor: role, industry, location, background, or key constraint.' })
  } else if (flowStage === 'linkedin') {
    systemContext.push({ role: 'system', content: 'STAGE: LinkedIn - Ask if they have a LinkedIn profile. Accept "no LinkedIn" as a valid answer.' })
  } else if (flowStage === 'ai_history') {
    systemContext.push({ role: 'system', content: 'STAGE: AI History - Offer upload of ChatGPT/Claude export. Tell them to say "continue without" if they prefer.' })
  }

  const conversation = messages.slice(-12).map(m => ({
    role: m.role,
    content: m.content,
  }))

  if (initialQuery && userMessages.length <= 1) {
    return [
      ...systemContext,
      ...conversation,
    ]
  }

  return [
    ...systemContext,
    ...conversation,
  ]
}

/**
 * Deterministic fallback - follows the same flow structure
 */
function buildDeterministicChatResponse(messages, userName, flowStage) {
  const userMessages = messages.filter((message) => message.role === 'user')
  const combined = messages.map((message) => message.content).join(' ').toLowerCase()
  const hasLinkedin = /linkedin\.com\/in\/|linkedin\.com\/pub\/|no linkedin|don't have|do not have|don't have a linkedin|do not have a linkedin/i.test(combined)
  const hasGoal = userMessages.length >= 1 && /(want|looking for|find|need|search|connect|mentor|career|opportunity|help)/i.test(combined)
  const hasSpecifics = /(because|so i can|next month|real estate|hospitality|operator|investor|founder|background|city|years?|experience)/i.test(combined)
  const hasContext = /(upload|export|attached|chatgpt|claude|ai history|skip|continue without)/i.test(combined)

  // Flow: AI History
  if (hasLinkedin || flowStage === 'ai_history') {
    if (hasContext) {
      return {
        kind: 'text',
        text: 'Got it. Starting the search with the context we have.',
      }
    }
    return {
      kind: 'upload_request',
      text: 'One more thing: to get the best matching results, upload your ChatGPT or Claude export. It gives me a broader view of your interests and working style. If that feels like too much, just say "continue without" and I\'ll run the search.',
      infoTitle: 'Add context for better matching',
      infoBody: 'Best: export ChatGPT from Settings > Data Controls > Export Data. Faster: ask your AI "Summarize my goals and who I should meet" and paste the answer.',
    }
  }

  // Flow: LinkedIn
  if (hasGoal && !hasLinkedin) {
    if (userMessages.length >= 3 || hasSpecifics) {
      return {
        kind: 'text',
        text: 'Good context. Do you have a LinkedIn profile I should use as additional signal? You can paste it here, or say "no LinkedIn" if you\'d prefer to skip it.',
      }
    }
  }

  // Flow: Goal
  if (hasGoal || userMessages.length >= 1) {
    return {
      kind: 'text',
      text: `Got it${userName ? `, ${userName}` : ''}. Let's narrow this down: what's the most important constraint for this connection? Is it the role, the industry, the location, or the background?`,
    }
  }

  // Initial greeting
  return {
    kind: 'text',
    text: `Hi${userName ? `, ${userName}` : ''}. Who do you want to find, and what would make this connection useful?`,
  }
}

/**
 * DeepSeek-powered candidate ranking with semantic matching
 */
async function rankCandidatesWithDeepSeek({ profile, messages, people }) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'

  // Build user profile summary
  const userProfile = buildUserProfileSummary(profile, messages)

  // Heuristic pre-filtering to reduce token usage (keep ~20 most relevant)
  const filtered = preFilterCandidates(userProfile, people)

  if (!apiKey) {
    return rankCandidatesDeterministic({ profile, messages, people })
  }

  try {
    const mentorList = filtered
      .map((p, i) => `${i + 1}. ${formatMentorBrief(p)}`)
      .join('\n')

    const prompt = `You are a professional mentor matching algorithm. Analyze the seeker's profile and rank mentors by fit.

SEEKER PROFILE:
${userProfile}

AVAILABLE MENTORS:
${mentorList}

Return JSON:
{
  "rankings": [
    {"rank": 1, "mentor_id": "id", "reason": "why this mentor fits", "score": 85},
    {"rank": 2, "mentor_id": "id", "reason": "why this mentor fits", "score": 78}
  ]
}

Rules:
- Return exactly 2 top mentors ranked by fit
- Score 0-100 based on: industry match, expertise relevance, location alignment, career goal fit
- Reasons should be specific to the seeker's goal
- Mentors must be from the provided list only`

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 800,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error('DeepSeek ranking failed, using deterministic:', response.status)
      return rankCandidatesDeterministic({ profile, messages, people })
    }

    const completion = await response.json()
    const content = completion?.choices?.[0]?.message?.content
    if (!content) {
      return rankCandidatesDeterministic({ profile, messages, people })
    }

    const rankings = extractRankings(content, filtered)
    if (rankings.length > 0) {
      return rankings
    }

    return rankCandidatesDeterministic({ profile, messages, people })
  } catch (error) {
    console.error('DeepSeek ranking error, falling back:', error)
    return rankCandidatesDeterministic({ profile, messages, people })
  }
}

function buildUserProfileSummary(profile, messages) {
  const parts = []

  if (profile?.summary) {
    parts.push(`Summary: ${profile.summary}`)
  }

  if (profile?.specificReason) {
    parts.push(`Goal: ${profile.specificReason}`)
  }

  if (profile?.industries?.length) {
    parts.push(`Industries: ${profile.industries.join(', ')}`)
  }

  if (profile?.locations?.length) {
    parts.push(`Locations: ${profile.locations.join(', ')}`)
  }

  if (profile?.interests?.length) {
    parts.push(`Interests: ${profile.interests.join(', ')}`)
  }

  const chatContext = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join(' | ')

  if (chatContext) {
    parts.push(`Chat context: ${chatContext}`)
  }

  return parts.join('\n')
}

function preFilterCandidates(userProfile, people) {
  const text = userProfile.toLowerCase()
  const signals = extractSignals(text)

  return people
    .map(person => {
      const haystack = [
        person.name,
        person.background,
        person.currentRole,
        person.location,
        ...(person.expertise || []),
        ...(person.industries || []),
        ...(person.interests || []),
      ].join(' ').toLowerCase()

      const matches = signals.filter(s => haystack.includes(s)).length
      const score = matches * 10 + (person.willingToMentor ? 15 : 0)

      return { person, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(r => r.person)
}

function extractSignals(text) {
  const signals = []
  const keywords = [
    'hospitality', 'real estate', 'luxury', 'finance', 'investment', 'consulting',
    'ai', 'technology', 'startup', 'entrepreneur', 'operations', 'product',
    'paris', 'london', 'new york', 'geneva', 'europe', 'uk',
    'mentor', 'founder', 'operator', 'investor', 'advisor',
    'policy', 'education', 'climate', 'sustainability',
  ]

  for (const kw of keywords) {
    if (text.includes(kw)) signals.push(kw)
  }

  return signals.slice(0, 15)
}

function formatMentorBrief(person) {
  return `${person.id}
Name: ${person.name}
Role: ${person.currentRole}
Background: ${person.background}
Location: ${person.location}
Expertise: ${(person.expertise || []).join(', ')}
Industries: ${(person.industries || []).join(', ')}
Willing to Mentor: ${person.willingToMentor ? 'Yes' : 'No'}`
}

function extractRankings(content, filteredPeople) {
  try {
    const parsed = JSON.parse(content)
    const rankings = parsed.rankings || []

    return rankings
      .slice(0, 2)
      .map((r, i) => {
        const person = filteredPeople.find(p => p.id === r.mentor_id) || filteredPeople[i]
        if (!person) return null

        return {
          person,
          score: Math.min(100, Math.max(0, r.score || 50)),
          reason: r.reason || 'Good fit based on profile',
          sharedSignals: extractSignals(person.background?.toLowerCase() || '').slice(0, 5),
          scoreBreakdown: { aiScore: r.score, availability: person.willingToMentor ? 10 : 0 },
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function rankCandidatesDeterministic({ profile, messages, people }) {
  const text = [
    profile?.summary || '',
    ...(profile?.industries || []),
    ...(profile?.locations || []),
    ...messages.filter(m => m.role === 'user').map(m => m.content),
  ].join(' ').toLowerCase()

  return people
    .map((person) => {
      const haystack = [
        person.name,
        person.background,
        person.currentRole,
        person.location,
        ...(person.expertise || []),
        ...(person.industries || []),
        ...(person.interests || []),
        ...(person.goals || []),
      ]
        .join(' ')
        .toLowerCase()

      const sharedSignals = [...new Set(
        text.split(/[^a-z0-9]+/)
          .filter(word => word.length > 3 && haystack.includes(word))
          .slice(0, 8)
      )]

      const score = Math.min(100, 35 + sharedSignals.length * 8 + (person.willingToMentor ? 10 : 0))

      return {
        person,
        score,
        scoreBreakdown: { overlap: sharedSignals.length * 8, availability: person.willingToMentor ? 10 : 0 },
        sharedSignals,
        reason: sharedSignals.length
          ? `Strong overlap around ${sharedSignals.slice(0, 3).join(', ')}.`
          : `Closest available profile based on current goal context.`,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
}

async function requireAuth(req, res) {
  const token = getBearerToken(req)
  if (!token) {
    res.status(401).json({ message: 'Sign in before using Luminous.' })
    return null
  }

  const user = await getUserByAccessToken(token)
  if (!user) {
    res.status(401).json({ message: 'Your session expired. Sign in again.' })
    return null
  }

  return user
}

function getBearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function extractProfile({ source = 'chat', contentSnippet = '', messages = [], initialQuery = '' }) {
  const text = `${initialQuery} ${messages.map((message) => message.content).join(' ')} ${contentSnippet}`.toLowerCase()

  return {
    summary: `Private profile generated from ${source}. Context: ${text.slice(0, 500)}`,
    specificReason: messages.find((message) => message.role === 'user')?.content || initialQuery,
    targetPerson: 'mentor or relevant operator',
    industries: pickSignals(text, ['hospitality', 'real estate', 'finance', 'startups', 'ai', 'policy', 'education', 'climate', 'luxury']),
    locations: pickSignals(text, ['paris', 'london', 'uk', 'new york', 'geneva', 'europe']),
    skills: pickSignals(text, ['founder', 'operations', 'fundraising', 'product', 'community', 'research', 'investment']),
    educationSignals: pickSignals(text, ['oxford', 'cambridge', 'harvard', 'hec', 'uk', 'university']),
    interests: pickSignals(text, ['founder', 'operations', 'fundraising', 'product', 'community', 'research', 'investment']),
    goals: pickSignals(text, ['learn', 'connect', 'build', 'validate', 'fundraise', 'career']),
    constraints: [],
    confidence: contentSnippet ? 'medium' : 'light',
    missingInfo: contentSnippet ? [] : ['AI-history context'],
    mode: 'deterministic',
  }
}

function pickSignals(text, signals) {
  return signals.filter((signal) => text.includes(signal))
}

function buildMockLinkedinProfile(linkedinUrl) {
  const slug = decodeURIComponent(linkedinUrl.split('/').filter(Boolean).pop() || 'profile').replace(/-/g, ' ')
  return {
    name: slug.replace(/\b\w/g, (char) => char.toUpperCase()),
    headline: 'LinkedIn Profile',
    location: '',
    signals: pickSignals(linkedinUrl.toLowerCase(), ['hospitality', 'real estate', 'startup', 'ai', 'finance', 'paris', 'london']),
    summary: `I read that LinkedIn URL and will use it as context for the search.`,
    sourceUrl: linkedinUrl,
    confidence: 'light',
  }
}

function normalizePayloadFromText(content) {
  try {
    return normalizePayload(JSON.parse(content.trim()), content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) return { kind: 'text', text: content.trim() }
    try {
      return normalizePayload(JSON.parse(match[0]), content)
    } catch {
      return { kind: 'text', text: content.trim() }
    }
  }
}

function normalizePayload(payload, rawText) {
  if (payload?.kind === 'upload_request') {
    return {
      kind: 'upload_request',
      text: String(payload.text || 'Upload AI history when ready, or say continue without.'),
      infoTitle: String(payload.infoTitle || 'Add context'),
      infoBody: String(payload.infoBody || 'Upload a ChatGPT/Claude export or paste a generated summary.'),
    }
  }
  return { kind: 'text', text: String(payload?.text || rawText || 'Tell me a little more.') }
}

function isEmptyPayload(payload) {
  return !payload || !String(payload.text || '').trim()
}

function payloadToSavedAssistantMessage(payload) {
  return { role: 'assistant', content: payloadToText(payload), payload }
}

function payloadToText(payload) {
  return payload.kind === 'connection_started' ? `${payload.title}. ${payload.text}` : payload.text
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return []
  return input
    .filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message?.content === 'string')
    .slice(-18)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
      payload: message.payload,
    }))
}

function sanitizeLinkedinProfile(input) {
  return input && typeof input === 'object' ? input : null
}

function sanitizeEmail(input) {
  const email = String(input || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 320) : ''
}

function sanitizePassword(input) {
  const password = String(input || '')
  return password.length >= 8 && password.length <= 256 ? password : ''
}

function looksLikeLinkedinUrl(value) {
  return /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\/[a-z0-9%_-]+\/?/i.test(value)
}

function humanizeAuthError(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/already/i.test(message)) return 'That email already has an account. Sign in instead.'
  if (/invalid|password/i.test(message)) return 'Invalid email or password.'
  return fallback
}

function loadLocalEnv() {
  const envPath = join(rootDir, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}