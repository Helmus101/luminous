import { mentors } from '../mentors.js'

const emailOnboardings = []
const profileImports = []
const matchRequests = []
const matchCandidates = []
const consentEmails = []
const connections = []
const authUsers = []
const chatSessions = []
const chatMessages = []

export function getRepositoryMode() {
  return process.env.DATA_BACKEND === 'supabase' ? 'supabase_ready_mock_runtime' : 'mock'
}

export function getNetworkPeople() {
  return mentors
}

export function saveEmailOnboarding({ email, initialQuery }) {
  const onboarding = {
    id: `email_${Date.now()}`,
    createdAt: new Date().toISOString(),
    email,
    initialQuery: initialQuery.slice(0, 1200),
    status: 'signed_in_mock',
  }

  emailOnboardings.push(onboarding)
  return onboarding
}

export function signUpWithPassword({ email, password, initialQuery }) {
  const existing = authUsers.find((user) => user.email === email)
  if (!existing) {
    authUsers.push({
      id: `auth_${Date.now()}`,
      email,
      password,
      createdAt: new Date().toISOString(),
    })
  }

  return signInWithPassword({ email, password, initialQuery })
}

export function signInWithPassword({ email, password, initialQuery }) {
  const user = authUsers.find((item) => item.email === email)
  if (!user || user.password !== password) {
    throw new Error('Invalid email or password.')
  }

  const onboarding = saveEmailOnboarding({ email, initialQuery })
  return {
    user: onboarding,
    authUser: {
      id: user.id,
      email,
    },
    session: {
      accessToken: `mock_token_${user.id}`,
      expiresAt: null,
    },
  }
}

export function getUserByAccessToken(accessToken) {
  if (!accessToken?.startsWith('mock_token_')) {
    return null
  }

  const authUserId = accessToken.replace('mock_token_', '')
  const user = authUsers.find((item) => item.id === authUserId)
  if (!user) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    appUserId: user.id,
  }
}

export function saveChatTranscript({ email, authUserId, sessionId, initialQuery, messages }) {
  let resolvedSessionId = sessionId

  if (!resolvedSessionId) {
    resolvedSessionId = `chat_${Date.now()}`
    chatSessions.push({
      id: resolvedSessionId,
      email,
      authUserId,
      initialQuery,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  const session = chatSessions.find((item) => item.id === resolvedSessionId)
  if (session) {
    session.updatedAt = new Date().toISOString()
  }

  for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
    if (chatMessages[index].sessionId === resolvedSessionId) {
      chatMessages.splice(index, 1)
    }
  }

  messages.forEach((message, index) => {
    chatMessages.push({
      id: `${resolvedSessionId}_${index}`,
      sessionId: resolvedSessionId,
      email,
      authUserId,
      role: message.role,
      content: message.content,
      payload: message.payload,
      messageIndex: index,
      createdAt: new Date().toISOString(),
    })
  })

  return { sessionId: resolvedSessionId, savedMessages: messages.length }
}

export function getLatestChat({ email, authUserId }) {
  const session = [...chatSessions]
    .filter((item) => (authUserId ? item.authUserId === authUserId : item.email === email))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]

  if (!session) {
    return null
  }

  return {
    sessionId: session.id,
    initialQuery: session.initialQuery,
    messages: chatMessages
      .filter((message) => message.sessionId === session.id)
      .sort((a, b) => a.messageIndex - b.messageIndex)
      .map((message) => ({
        role: message.role,
        content: message.content,
        payload: message.payload,
      })),
  }
}

export function saveProfileImport({ email, source, fileName, generatedProfile, snippetLength }) {
  const record = {
    id: `profile_${Date.now()}`,
    createdAt: new Date().toISOString(),
    email,
    source,
    fileName,
    snippetLength,
    generatedProfile,
  }

  profileImports.push(record)
  return record
}

export function createConnectionRequest({ email, linkedinUrl, generatedProfile, messages, candidates }) {
  const requestId = `connection_${Date.now()}`
  const request = {
    id: requestId,
    createdAt: new Date().toISOString(),
    email,
    linkedinUrl,
    generatedProfile,
    messageCount: messages.length,
    status: 'consent_pending',
  }

  matchRequests.push(request)

  candidates.slice(0, 2).forEach((candidate, index) => {
    const candidateRecord = {
      id: `${requestId}_${candidate.person.id}`,
      requestId,
      personId: candidate.person.id,
      rank: index + 1,
      score: candidate.score,
      scoreBreakdown: candidate.scoreBreakdown,
      reason: candidate.reason,
      sharedSignals: candidate.sharedSignals,
    }

    matchCandidates.push(candidateRecord)
    consentEmails.push(
      buildConsentEmailRecord({
        requestId,
        candidateId: candidate.person.id,
        recipientType: 'requester',
        to: email,
        subject: `Luminous found a possible connection: ${candidate.person.name}`,
        recipientName: 'there',
        otherName: candidate.person.name,
        otherLinkedin: candidate.person.linkedinUrl,
        profileSummary: `${candidate.person.currentRole}. ${candidate.person.background}.`,
        reason: candidate.reason,
      }),
      buildConsentEmailRecord({
        requestId,
        candidateId: candidate.person.id,
        recipientType: 'candidate',
        to: candidate.person.contact,
        subject: 'Luminous found someone who may be worth meeting',
        recipientName: candidate.person.name.split(' ')[0],
        otherName: email,
        otherLinkedin: linkedinUrl || 'LinkedIn not provided',
        profileSummary: generatedProfile.summary,
        reason: `Their context overlaps with your work in ${candidate.person.expertise.slice(0, 2).join(' and ')}.`,
      }),
    )
  })

  return {
    request,
    queuedEmails: candidates.slice(0, 2).length * 2,
  }
}

export function getSearchQuota(email) {
  const now = new Date()
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const used = matchRequests.filter((request) => {
    const createdAt = new Date(request.createdAt)
    const requestMonthKey = `${createdAt.getUTCFullYear()}-${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`
    return request.email === email && requestMonthKey === monthKey
  }).length

  return {
    limit: 3,
    used,
    remaining: Math.max(0, 3 - used),
    monthKey,
  }
}

export function getMockOutbox(requestId) {
  const emails = consentEmails
    .filter((email) => email.requestId === requestId)
    .map((email) => ({
      id: email.id,
      requestId: email.requestId,
      recipientType: email.recipientType,
      to: email.to,
      subject: email.subject,
      body: email.body,
      status: email.status,
      mailtoUrl: email.mailtoUrl,
      createdAt: email.createdAt,
    }))

  return {
    requestId,
    emails,
  }
}

export function recordConsentDecision({ emailId, decision }) {
  const email = consentEmails.find((item) => item.id === emailId)
  if (!email) {
    return null
  }

  email.status = decision === 'accepted' ? 'accepted' : 'declined'
  email.respondedAt = new Date().toISOString()

  const pairEmails = consentEmails.filter(
    (item) => item.requestId === email.requestId && item.candidateId === email.candidateId,
  )
  const request = matchRequests.find((item) => item.id === email.requestId)

  if (pairEmails.some((item) => item.status === 'declined')) {
    updateRequestStatus(request, 'declined')
  }

  if (pairEmails.length === 2 && pairEmails.every((item) => item.status === 'accepted')) {
    const existingConnection = connections.find(
      (item) => item.requestId === email.requestId && item.candidateId === email.candidateId,
    )

    if (!existingConnection) {
      connections.push({
        id: `connected_${Date.now()}`,
        requestId: email.requestId,
        candidateId: email.candidateId,
        createdAt: new Date().toISOString(),
        status: 'connected',
      })
    }

    updateRequestStatus(request, 'connected')
  }

  return {
    email,
    requestStatus: request?.status || 'consent_pending',
    connectionCreated: request?.status === 'connected',
  }
}

const mockCampuses = [
  {
    id: 'c1',
    name: 'University of Oxford',
    slug: 'oxford',
    vibe: 'Historic, collegiate, and steeped in tradition.',
    insider_hooks: ['College system', 'Tutorials', 'The Bodleian'],
    location: 'Oxford, UK'
  },
  {
    id: 'c2',
    name: 'London School of Economics',
    slug: 'lse',
    vibe: 'Urban, ambitious, and globally focused.',
    insider_hooks: ['Holborn networking', 'Public lectures', 'Career focus'],
    location: 'London, UK'
  },
  {
    id: 'c3',
    name: 'HEC Paris',
    slug: 'hec-paris',
    vibe: 'Elite, entrepreneurial, and deeply networked.',
    insider_hooks: ['Jouy-en-Josas campus', 'Grandes Écoles network', 'Finance & Luxury focus'],
    location: 'Paris, France'
  }
]

export function getCampusesWithScouts() {
  return mockCampuses.map((campus) => ({
    ...campus,
    scouts: mentors
      .filter(
        (m) =>
          m.background?.toLowerCase().includes(campus.name.toLowerCase()) ||
          m.background?.toLowerCase().includes(campus.slug.toLowerCase()),
      )
      .map((m) => ({
        id: m.id,
        name: m.name,
        current_role_text: m.currentRole,
        campus_id: campus.id,
      })),
  }))
}

export function getRepositorySnapshot() {
  return {
    emailOnboardings: emailOnboardings.length,
    authUsers: authUsers.length,
    chatSessions: chatSessions.length,
    chatMessages: chatMessages.length,
    profileImports: profileImports.length,
    matchRequests: matchRequests.length,
    matchCandidates: matchCandidates.length,
    consentEmails: consentEmails.length,
    connections: connections.length,
  }
}

function buildConsentEmailRecord({
  requestId,
  candidateId,
  recipientType,
  to,
  subject,
  recipientName,
  otherName,
  otherLinkedin,
  profileSummary,
  reason,
}) {
  const body = `Hi ${recipientName},

Luminous found a possible connection: ${otherName}.

Profile: ${otherLinkedin}

Why Luminous thinks this is relevant:
${reason}

Quick context:
${profileSummary}

Would you like to connect? Reply yes or no.

Best,
Luminous`

  return {
    id: `${requestId}_${candidateId}_${recipientType}`,
    requestId,
    candidateId,
    recipientType,
    to,
    subject,
    body,
    mailtoUrl: buildMailtoUrl({ to, subject, body }),
    status: 'drafted_mock',
    createdAt: new Date().toISOString(),
  }
}

function buildMailtoUrl({ to, subject, body }) {
  const params = new URLSearchParams({
    subject,
    body,
  })
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`
}

function updateRequestStatus(request, status) {
  if (request) {
    request.status = status
    request.updatedAt = new Date().toISOString()
  }
}
