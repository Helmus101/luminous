import { createClient } from '@supabase/supabase-js'
import { mentors } from '../mentors.js'

let client
let authClient
let seedPromise

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && getSupabaseKey())
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null
  }

  if (!client) {
    client = createClient(process.env.SUPABASE_URL, getSupabaseKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return client
}

export function getSupabaseAuthClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return null
  }

  if (!authClient) {
    authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return authClient
}

export function getSupabaseKeyMode() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'service_role'
  }

  if (process.env.SUPABASE_ANON_KEY) {
    return 'anon'
  }

  return 'missing'
}

function getSupabaseKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
}

export async function ensurePeopleSeeded() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { seeded: false, count: 0 }
  }

  if (!seedPromise) {
    seedPromise = seedPeople(supabase)
  }

  return seedPromise
}

export async function getNetworkPeople() {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return mentors
  }

  await ensurePeopleSeeded()
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('willing_to_connect', true)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Supabase people select failed: ${error.message}`)
  }

  return data.map(fromPersonRow)
}

export async function saveEmailOnboarding({ email, initialQuery }) {
  return upsertAppUser({ email, initialQuery })
}

export async function upsertAppUser({ email, initialQuery = '', authUserId = null, firstName, fullName }) {
  const supabase = getSupabaseClient()
  const row = { email }
  if (authUserId) row.auth_user_id = authUserId
  if (firstName !== undefined) row.first_name = firstName
  if (fullName !== undefined) row.full_name = fullName
  const { data, error } = await supabase
    .from('users')
    .upsert(row, { onConflict: 'email' })
    .select()
    .single()

  if (error) {
    throw new Error(`Supabase user upsert failed: ${error.message}`)
  }

  return {
    id: data.id,
    authUserId: data.auth_user_id,
    firstName: data.first_name || '',
    fullName: data.full_name || '',
    createdAt: data.created_at,
    email,
    initialQuery: initialQuery.slice(0, 1200),
    status: 'signed_in_supabase',
  }
}

export async function signUpWithPassword({ email, password, initialQuery }) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    const message = String(error.message || '')
    if (!message.toLowerCase().includes('already')) {
      throw new Error(`Supabase auth signup failed: ${message}`)
    }
  }

  return signInWithPassword({ email, password, initialQuery, authUserId: data?.user?.id })
}

export async function signInWithPassword({ email, password, initialQuery, authUserId }) {
  const auth = getSupabaseAuthClient()
  if (!auth) {
    throw new Error('Supabase auth requires SUPABASE_ANON_KEY for password sign in.')
  }

  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`Supabase auth signin failed: ${error.message}`)
  }

  const user = await upsertAppUser({
    email: data.user.email || email,
    authUserId: authUserId || data.user.id,
    initialQuery,
  })

  return {
    user,
    authUser: {
      id: data.user.id,
      email: data.user.email || email,
    },
    profile: {
      firstName: user.firstName,
      fullName: user.fullName,
    },
    session: {
      accessToken: data.session?.access_token || '',
      expiresAt: data.session?.expires_at || null,
    },
  }
}

export async function getUserByAccessToken(accessToken) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error || !data?.user?.email) {
    return null
  }

  const user = await upsertAppUser({
    email: data.user.email,
    authUserId: data.user.id,
    initialQuery: '',
  })

  return {
    id: data.user.id,
    email: data.user.email,
    appUserId: user.id,
    firstName: user.firstName,
    fullName: user.fullName,
  }
}

export async function updateUserName({ email, authUserId, fullName }) {
  const cleanFullName = String(fullName || '').trim().slice(0, 160)
  const firstName = cleanFullName.split(/\s+/)[0] || cleanFullName
  return upsertAppUser({
    email,
    authUserId,
    firstName: firstName.slice(0, 80),
    fullName: cleanFullName,
    initialQuery: '',
  })
}

export async function saveChatTranscript({ email, authUserId, sessionId, initialQuery, messages }) {
  const user = await upsertAppUser({ email, authUserId, initialQuery: initialQuery || '' })
  const supabase = getSupabaseClient()
  let resolvedSessionId = sessionId

  if (!resolvedSessionId) {
    const title =
      messages.find((message) => message.role === 'user')?.content?.slice(0, 80) ||
      initialQuery?.slice(0, 80) ||
      'Luminous chat'
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        auth_user_id: authUserId,
        email,
        initial_query: initialQuery || '',
        title,
      })
      .select()
      .single()

    if (sessionError) {
      throw new Error(`Supabase chat session insert failed: ${sessionError.message}`)
    }
    resolvedSessionId = session.id
  } else {
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', resolvedSessionId)
      .eq('email', email)

    if (updateError) {
      throw new Error(`Supabase chat session update failed: ${updateError.message}`)
    }
  }

  const { error: deleteError } = await supabase.from('chat_messages').delete().eq('session_id', resolvedSessionId)
  if (deleteError) {
    throw new Error(`Supabase chat message replace failed: ${deleteError.message}`)
  }

  const rows = messages.map((message, index) => ({
    session_id: resolvedSessionId,
    user_id: user.id,
    auth_user_id: authUserId,
    email,
    role: message.role,
    content: message.content,
    payload: message.payload || null,
    message_index: index,
  }))

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('chat_messages').insert(rows)
    if (insertError) {
      throw new Error(`Supabase chat message insert failed: ${insertError.message}`)
    }
  }

  return { sessionId: resolvedSessionId, savedMessages: rows.length }
}

export async function deleteAllChatHistory(email) {
  const supabase = getSupabaseClient()
  if (!supabase) return

  // Delete everything related to this email
  // Also clean up connections and consent emails
  const { data: requests } = await supabase.from('match_requests').select('id').eq('requester_email', email)
  if (requests?.length) {
    const ids = requests.map(r => r.id)
    await supabase.from('consent_emails').delete().in('request_id', ids)
    await supabase.from('connections').delete().in('request_id', ids)
    await supabase.from('match_candidates').delete().in('request_id', ids)
  }

  await supabase.from('chat_messages').delete().eq('email', email)
  await supabase.from('chat_sessions').delete().eq('email', email)
  await supabase.from('match_requests').delete().eq('requester_email', email)
  await supabase.from('profiles').delete().eq('email', email)

  // Reset user profile fields
  await supabase
    .from('users')
    .update({ first_name: null, full_name: null })
    .eq('email', email)
}

export async function getLatestChat({ email, authUserId }) {
  const supabase = getSupabaseClient()
  let query = supabase.from('chat_sessions').select('*').order('updated_at', { ascending: false }).limit(1)
  query = authUserId ? query.eq('auth_user_id', authUserId) : query.eq('email', email)
  const { data: sessions, error: sessionError } = await query

  if (sessionError) {
    throw new Error(`Supabase chat session select failed: ${sessionError.message}`)
  }

  const session = sessions?.[0]
  if (!session) {
    return null
  }

  const { data: messages, error: messageError } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', session.id)
    .order('message_index', { ascending: true })

  if (messageError) {
    throw new Error(`Supabase chat message select failed: ${messageError.message}`)
  }

  return {
    sessionId: session.id,
    initialQuery: session.initial_query,
    messages: messages.map((message) => ({
      role: message.role,
      content: message.content,
      payload: message.payload || undefined,
    })),
  }
}

export async function saveProfileImport({ email, source, fileName, generatedProfile, snippetLength }) {
  const user = await upsertAppUser({ email, initialQuery: '' })
  const row = {
    user_id: user.id,
    email,
    source,
    file_name: fileName,
    summary: generatedProfile.summary,
    specific_reason: generatedProfile.specificReason,
    target_person: generatedProfile.targetPerson,
    industries: generatedProfile.industries,
    locations: generatedProfile.locations,
    skills: generatedProfile.skills,
    education_signals: generatedProfile.educationSignals,
    interests: generatedProfile.interests,
    goals: generatedProfile.goals,
    constraints: generatedProfile.constraints,
    confidence: generatedProfile.confidence,
    missing_info: generatedProfile.missingInfo,
    extraction_mode: generatedProfile.mode,
    profile_json: { snippetLength },
  }
  const { data, error } = await getSupabaseClient().from('profiles').insert(row).select().single()

  if (error) {
    throw new Error(`Supabase profile insert failed: ${error.message}`)
  }

  return {
    id: data.id,
    createdAt: data.created_at,
    email,
    source,
    fileName,
    snippetLength,
    generatedProfile,
  }
}

export async function createConnectionRequest({ email, linkedinUrl, generatedProfile, messages, candidates }) {
  const user = await upsertAppUser({ email, initialQuery: '' })
  const supabase = getSupabaseClient()
  const { data: request, error: requestError } = await supabase
    .from('match_requests')
    .insert({
      requester_email: email,
      requester_user_id: user.id,
      linkedin_url: linkedinUrl,
      status: 'consent_pending',
    })
    .select()
    .single()

  if (requestError) {
    throw new Error(`Supabase match request insert failed: ${requestError.message}`)
  }

  const candidateRecords = []
  for (const [index, candidate] of candidates.slice(0, 2).entries()) {
    const { data: peopleRows, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('external_key', candidate.person.id)
      .limit(1)

    if (personError) {
      throw new Error(`Supabase person lookup failed: ${personError.message}`)
    }

    const personId = peopleRows?.[0]?.id
    if (!personId) {
      continue
    }

    const { data: candidateRow, error: candidateError } = await supabase
      .from('match_candidates')
      .insert({
        request_id: request.id,
        person_id: personId,
        rank: index + 1,
        score: candidate.score,
        score_breakdown: candidate.scoreBreakdown,
        shared_signals: candidate.sharedSignals,
        reason: candidate.reason,
      })
      .select()
      .single()

    if (candidateError) {
      throw new Error(`Supabase candidate insert failed: ${candidateError.message}`)
    }
    candidateRecords.push(toPublicCandidate(candidateRow, candidate.person, candidate))
  }

  return {
    request: {
      id: request.id,
      createdAt: request.created_at,
      email,
      linkedinUrl,
      generatedProfile,
      messageCount: messages.length,
      status: request.status,
    },
    candidates: candidateRecords,
    queuedEmails: 0,
  }
}

export async function selectCandidateForRequest({ email, requestId, candidateId, customBody, customSubject }) {
  const supabase = getSupabaseClient()
  const { data: request, error: requestError } = await supabase
    .from('match_requests')
    .select('*')
    .eq('id', requestId)
    .eq('requester_email', email)
    .single()

  if (requestError || !request) {
    throw new Error('Match request not found.')
  }

  if (request.selected_candidate_id) {
    throw new Error('A candidate is already selected for this search.')
  }

  const { data: candidate, error: candidateError } = await supabase
    .from('match_candidates')
    .select('*, people(*)')
    .eq('id', candidateId)
    .eq('request_id', requestId)
    .single()

  if (candidateError || !candidate) {
    throw new Error('Candidate not found for this search.')
  }

  const selectedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('match_requests')
    .update({
      selected_candidate_id: candidateId,
      user_selected_at: selectedAt,
      updated_at: selectedAt,
      status: 'candidate_contacted',
    })
    .eq('id', requestId)
    .eq('requester_email', email)
    .is('selected_candidate_id', null)

  if (updateError) {
    throw new Error(`Supabase match request selection failed: ${updateError.message}`)
  }

  const person = fromPersonRow(candidate.people)
  const emailRecord = buildConsentEmailRecord({
    requestId,
    candidateId,
    recipientType: 'candidate',
    to: person.contact,
    subject: customSubject || 'Luminous found someone who may be worth meeting',
    recipientName: person.name.split(' ')[0],
    otherName: email,
    otherLinkedin: request.linkedin_url || 'LinkedIn not provided',
    profileSummary: 'The requester is looking for a focused mentor introduction.',
    reason: candidate.reason,
    emailStage: 'candidate_consent',
    customBody,
  })

  const { data: emailRow, error: emailError } = await supabase
    .from('consent_emails')
    .insert(toConsentEmailRow(emailRecord))
    .select()
    .single()


  if (emailError) {
    throw new Error(`Supabase selected candidate email insert failed: ${emailError.message}`)
  }

  return {
    requestId,
    candidate: toPublicCandidate(candidate, person, {
      score: candidate.score,
      reason: candidate.reason,
      sharedSignals: candidate.shared_signals || [],
      scoreBreakdown: candidate.score_breakdown || {},
    }),
    queuedEmail: {
      id: emailRow.id,
      to: emailRow.recipient_email,
      subject: emailRow.subject,
      status: emailRow.status,
      emailStage: emailRow.email_stage,
    },
  }
}

export async function getSearchQuota(email) {
  const now = new Date()
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const supabase = getSupabaseClient()
  const { count, error } = await supabase
    .from('match_requests')
    .select('id', { count: 'exact', head: true })
    .eq('requester_email', email)
    .eq('status', 'connected')
    .gte('created_at', monthStart)

  if (error) {
    throw new Error(`Supabase quota select failed: ${error.message}`)
  }

  const used = count || 0
  return {
    limit: 3,
    used,
    remaining: Math.max(0, 3 - used),
    monthKey,
  }
}

export async function getMockOutbox(requestId) {
  const { data, error } = await getSupabaseClient()
    .from('consent_emails')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(`Supabase outbox select failed: ${error.message}`)
  }

  return {
    requestId,
    emails: data.map((email) => ({
      id: email.id,
      requestId: email.request_id,
      recipientType: email.recipient_type,
      to: email.recipient_email,
      subject: email.subject,
      body: email.body,
      status: email.status,
      emailStage: email.email_stage,
      mailtoUrl: email.mailto_url,
      createdAt: email.created_at,
    })),
  }
}

export async function recordConsentDecision({ emailId, decision }) {
  const status = decision === 'accepted' ? 'accepted' : 'declined'
  const supabase = getSupabaseClient()
  const { data: email, error } = await supabase
    .from('consent_emails')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', emailId)
    .select()
    .single()

  if (error || !email) {
    return null
  }

  const { data: pairEmails, error: pairError } = await supabase
    .from('consent_emails')
    .select('*')
    .eq('request_id', email.request_id)
    .eq('candidate_id', email.candidate_id)

  if (pairError) {
    throw new Error(`Supabase consent pair select failed: ${pairError.message}`)
  }

  let requestStatus = 'candidate_contacted'
  let connectionCreated = false
  if (pairEmails.some((item) => item.status === 'declined')) {
    requestStatus = 'declined'
    await supabase.from('match_requests').update({ status: requestStatus, updated_at: new Date().toISOString() }).eq('id', email.request_id)
  } else if (email.email_stage === 'candidate_consent' && status === 'accepted') {
    requestStatus = 'connected'
    const { data: request } = await supabase.from('match_requests').select('*').eq('id', email.request_id).single()
    const { data: candidate } = await supabase
      .from('match_candidates')
      .select('*, people(*)')
      .eq('id', email.candidate_id)
      .single()
    await supabase.from('connections').insert({
      request_id: email.request_id,
      candidate_id: email.candidate_id,
      status: 'connected',
    })
    await supabase.from('match_requests').update({ status: requestStatus, updated_at: new Date().toISOString() }).eq('id', email.request_id)
    if (request && candidate?.people) {
      const person = fromPersonRow(candidate.people)
      const introBody = `Hi both,

You both said yes to connecting through Luminous.

${person.name}, meet ${request.requester_email}.
${request.requester_email}, meet ${person.name}: ${person.currentRole}.

I'll leave you two to find a good time.

Best,
Luminous`
      const introSubject = `Warm intro: ${request.requester_email} + ${person.name}`
      await supabase.from('consent_emails').insert([
        toConsentEmailRow({
          requestId: email.request_id,
          candidateId: email.candidate_id,
          recipientType: 'requester',
          to: request.requester_email,
          subject: introSubject,
          body: introBody,
          mailtoUrl: buildMailtoUrl({ to: request.requester_email, subject: introSubject, body: introBody }),
          status: 'drafted',
          emailStage: 'warm_intro',
        }),
        toConsentEmailRow({
          requestId: email.request_id,
          candidateId: email.candidate_id,
          recipientType: 'candidate',
          to: person.contact,
          subject: introSubject,
          body: introBody,
          mailtoUrl: buildMailtoUrl({ to: person.contact, subject: introSubject, body: introBody }),
          status: 'drafted',
          emailStage: 'warm_intro',
        }),
      ])
    }
    connectionCreated = true
  }

  return {
    email,
    requestStatus,
    connectionCreated,
  }
}

export async function getRepositorySnapshot() {
  const supabase = getSupabaseClient()
  const tables = ['users', 'profiles', 'chat_sessions', 'chat_messages', 'match_requests', 'match_candidates', 'consent_emails', 'connections']
  const entries = await Promise.all(
    tables.map(async (table) => {
      const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
      return [table, count || 0]
    }),
  )

  return Object.fromEntries(entries)
}

async function seedPeople(supabase) {
  const rows = mentors.map(toPersonRow)
  const { error } = await supabase.from('people').upsert(rows, { onConflict: 'external_key' })

  if (error) {
    throw new Error(`Supabase people seed failed: ${error.message}`)
  }

  return { seeded: true, count: rows.length }
}

function toPersonRow(person) {
  return {
    external_key: person.id,
    name: person.name,
    background: person.background,
    current_role_text: person.currentRole,
    expertise: person.expertise,
    interests: person.interests,
    goals: person.goals,
    relationship_preferences: person.relationshipPreferences,
    location: person.location,
    industries: person.industries,
    willing_to_connect: person.willingToMentor,
    contact_email: person.contact,
    linkedin_url: person.linkedinUrl,
    profile_json: { seeded: true },
  }
}

function fromPersonRow(row) {
  return {
    id: row.external_key || row.id,
    name: row.name,
    background: row.background,
    currentRole: row.current_role_text,
    expertise: row.expertise || [],
    interests: row.interests || [],
    goals: row.goals || [],
    relationshipPreferences: row.relationship_preferences || [],
    location: row.location,
    industries: row.industries || [],
    willingToMentor: row.willing_to_connect,
    contact: row.contact_email,
    linkedinUrl: row.linkedin_url,
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
  emailStage = 'candidate_consent',
  customBody,
}) {
  const body = customBody || `Hi ${recipientName},

I am Luminous, an AI matching agent. I've identified you as a high-signal connection for ${otherName}.

Context: ${otherLinkedin}

Match reasoning: ${reason}

Would you be open to a double opt-in introduction?

Best,
Luminous`

  return {
    requestId,
    candidateId,
    recipientType,
    to,
    subject,
    body,
    mailtoUrl: buildMailtoUrl({ to, subject, body }),
    status: 'drafted',
    emailStage,
  }
}

function toConsentEmailRow(email) {
  return {
    request_id: email.requestId,
    candidate_id: email.candidateId,
    recipient_email: email.to,
    recipient_type: email.recipientType,
    subject: email.subject,
    body: email.body,
    mailto_url: email.mailtoUrl,
    status: email.status,
    email_stage: email.emailStage || 'candidate_consent',
  }
}

function toPublicCandidate(candidateRow, person, candidate) {
  return {
    id: candidateRow.id,
    rank: candidateRow.rank,
    name: person.name,
    currentRole: person.currentRole,
    linkedinUrl: person.linkedinUrl,
    reason: candidate.reason,
    score: candidate.score,
    label: candidate.score >= 75 ? 'Strong fit' : 'Relevant fit',
    sharedSignals: candidate.sharedSignals || candidateRow.shared_signals || [],
  }
}

function buildMailtoUrl({ to, subject, body }) {
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  return `mailto:${encodeURIComponent(to)}?${query}`
}
