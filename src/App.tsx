import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Role = 'user' | 'assistant'
type Screen = 'landing' | 'auth' | 'chat'

type AssistantPayload =
  | { kind: 'text'; text: string }
  | { kind: 'upload_request'; text: string; infoTitle: string; infoBody: string }
  | {
      kind: 'connection_started'
      title: string
      text: string
      queuedEmails: number
      note: string
      requestId?: string
      candidates?: Candidate[]
    }

type ChatMessage = {
  id: string
  role: Role
  content: string
  payload?: AssistantPayload
}

type Candidate = {
  id: string
  rank: number
  name: string
  currentRole: string
  linkedinUrl: string
  reason: string
  score: number
  label: string
  sharedSignals?: string[]
}

const TOKEN_KEY = 'luminous-access-token'
const EMAIL_KEY = 'luminous-email'
const NAME_KEY = 'luminous-name'

function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [heroQuery, setHeroQuery] = useState('')
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(NAME_KEY) || '')
  const [needsName, setNeedsName] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatSessionId, setChatSessionId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [generatedProfile, setGeneratedProfile] = useState<unknown>(null)
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const transcriptRef = useRef<HTMLDivElement>(null)
  const isAuthed = Boolean(accessToken && email)

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending, importStatus])

  useEffect(() => {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken)
    if (email) localStorage.setItem(EMAIL_KEY, email)
    if (displayName) localStorage.setItem(NAME_KEY, displayName)
  }, [accessToken, displayName, email])

  function handleHeroSubmit(event: FormEvent) {
    event.preventDefault()
    if (!heroQuery.trim()) return
    setScreen('auth')
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault()
    setAuthError(null)
    if (!isValidEmail(email) || password.length < 8) {
      setAuthError('Use a valid email and a password with at least 8 characters.')
      return
    }

    const response = await fetch(authMode === 'signup' ? '/api/auth/signup' : '/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, initialQuery: heroQuery }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setAuthError(data.message || 'Could not sign in.')
      return
    }

    const token = String(data.session?.accessToken || '')
    if (!token) {
      setAuthError('Supabase did not return a session.')
      return
    }

    setAccessToken(token)
    setEmail(String(data.authUser?.email || email))
    const firstName = String(data.profile?.firstName || '')
    setDisplayName(firstName)
    setScreen('chat')

    if (firstName) {
      const loaded = await loadLatestChat(token)
      if (loaded) {
        setMessages(loaded.messages)
        setChatSessionId(loaded.chatSessionId)
        if (heroQuery.trim()) {
          await sendUserMessage(heroQuery.trim(), { token, baseMessages: loaded.messages, skipAuthCheck: true })
        }
        return
      }
      await startChatAfterName(firstName, token)
    } else {
      setNeedsName(true)
      setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: 'Before we start, what should I call you?' }])
    }
  }

  async function startChatAfterName(name: string, token = accessToken) {
    setNeedsName(false)
    setError(null)
    const intro: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Nice to meet you, ${name}. I’ll help sharpen the search before I run a private fit check.`,
    }
    if (!heroQuery.trim()) {
      setMessages([intro, { id: crypto.randomUUID(), role: 'assistant', content: 'Who do you want to find?' }])
      return
    }

    const goal: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: heroQuery.trim() }
    const next = [intro, goal]
    setMessages(next)
    await requestChat(next, token, '')
  }

  async function handleChatSubmit(event: FormEvent) {
    event.preventDefault()
    await sendUserMessage(chatInput)
  }

  async function sendUserMessage(
    text: string,
    options: { token?: string; baseMessages?: ChatMessage[]; skipAuthCheck?: boolean } = {},
  ) {
    const clean = text.trim()
    if (!clean || isSending) return
    const activeToken = options.token || accessToken
    if (!options.skipAuthCheck && !isAuthed) {
      setScreen('auth')
      return
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: clean }
    const next = [...(options.baseMessages || messages), userMessage]
    setMessages(next)
    setChatInput('')

    if (needsName) {
      const name = clean.split(/\s+/)[0]
      const response = await fetch('/api/user-profile', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ fullName: clean }),
      })
      if (!response.ok) {
        setError('Could not save your name. Try again.')
        return
      }
      setDisplayName(name)
      localStorage.setItem(NAME_KEY, name)
      await startChatAfterName(name)
      return
    }

    if (looksLikeLinkedin(clean)) {
      setLinkedinUrl(clean)
      void extractLinkedin(clean)
    }

    await requestChat(next, activeToken)
  }

  async function requestChat(history: ChatMessage[], token = accessToken, activeSessionId = chatSessionId) {
    setIsSending(true)
    setError(null)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          chatSessionId: activeSessionId,
          initialQuery: heroQuery,
          userName: displayName,
          messages: history.map(({ role, content, payload }) => ({ role, content, payload })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Luminous got stuck.')
      if (data.chatSessionId) setChatSessionId(String(data.chatSessionId))
      setMessages((current) => [...current, makeAssistant(data.message)])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setIsSending(false)
    }
  }

  async function extractLinkedin(url: string) {
    const response = await fetch('/api/linkedin-profile', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ linkedinUrl: url }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.profile?.summary) {
      setMessages((current) => [...current, makeAssistant({ kind: 'text', text: `${data.profile.summary} I’ll use that as context.` })])
    }
  }

  async function uploadHistory() {
    if (!importFile) {
      setImportStatus('Choose a file first, or paste a prompt summary in the chat.')
      return
    }
    setImportStatus('Reading export...')
    const snippet = (await importFile.text()).slice(0, 8000)
    const response = await fetch('/api/profile-import', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        source: 'AI history export',
        fileName: importFile.name,
        contentSnippet: snippet,
        initialQuery: heroQuery,
        messages: messages.map(({ role, content }) => ({ role, content })),
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setImportStatus(data.message || 'Could not import that file.')
      return
    }
    setGeneratedProfile(data.generatedProfile)
    setImportStatus('Profile built from export. Starting private fit check...')
    await startConnection(data.generatedProfile)
  }

  async function startConnection(profile = generatedProfile) {
    setIsSending(true)
    try {
      const response = await fetch('/api/connection-request', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          generatedProfile: profile,
          linkedinUrl,
          messages: messages.map(({ role, content }) => ({ role, content })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Could not start search.')
      setMessages((current) => [
        ...current,
        makeAssistant({
          kind: 'connection_started',
          title: 'Search complete',
          text: 'I found a few possible candidates. Choose one person and I’ll queue outreach to see if they’re interested.',
          queuedEmails: Number(data.queuedEmails || 0),
          note: 'You can only choose one person for this search.',
          requestId: data.requestId,
          candidates: Array.isArray(data.candidates) ? data.candidates : [],
        }),
      ])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start search.')
    } finally {
      setIsSending(false)
    }
  }

  function authHeaders(token = accessToken) {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }

  async function loadLatestChat(token = accessToken) {
    const response = await fetch('/api/chat/latest', { headers: authHeaders(token) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.chat?.messages?.length) return null
    return {
      chatSessionId: String(data.chat.sessionId || ''),
      messages: data.chat.messages.map(hydrateMessage),
    }
  }

  async function chooseCandidate(requestId: string, candidate: Candidate) {
    if (selectedCandidateId) return
    const response = await fetch(`/api/match-requests/${encodeURIComponent(requestId)}/select-candidate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ candidateId: candidate.id }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.message || 'Could not choose that candidate.')
      return
    }
    setSelectedCandidateId(candidate.id)
    setMessages((current) => [
      ...current,
      makeAssistant({
        kind: 'text',
        text: data.message || `I've queued outreach to ${candidate.name}. I'll let you know if they're interested.`,
      }),
    ])
  }

  if (screen === 'landing') {
    return (
      <main className="app-shell">
        <section className="landing-view">
          <div className="hero-copy">
            <p className="eyebrow">Private mentor matching</p>
            <h1>Who do you want to find?</h1>
            <p>Luminous clarifies the goal, learns your context, then starts a private double opt-in search.</p>
          </div>
          <form className="hero-chat" onSubmit={handleHeroSubmit}>
            <label htmlFor="hero-query">Search</label>
            <div>
              <input id="hero-query" value={heroQuery} onChange={(event) => setHeroQuery(event.target.value)} placeholder="A Paris hospitality operator who understands luxury real estate..." />
              <button type="submit" disabled={!heroQuery.trim()}>-&gt;</button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  if (screen === 'auth') {
    return (
      <main className="app-shell">
        <section className="auth-view">
          <form className="auth-panel" onSubmit={handleAuthSubmit}>
            <p className="eyebrow">{authMode === 'signup' ? 'Create account' : 'Sign in'}</p>
            <h1>Continue privately.</h1>
            {heroQuery && <blockquote>{heroQuery}</blockquote>}
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <div className="auth-mode">
              <button type="button" className={authMode === 'signin' ? 'active' : ''} onClick={() => setAuthMode('signin')}>Sign in</button>
              <button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Create</button>
            </div>
            <button type="submit">{authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
            {authError && <span className="form-error">{authError}</span>}
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="chat-view">
        <div className="chat-window">
          <div className="transcript" ref={transcriptRef}>
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                importFile={importFile}
                setImportFile={setImportFile}
                showHelp={showHelp}
                setShowHelp={setShowHelp}
                uploadHistory={uploadHistory}
                startConnection={startConnection}
                importStatus={importStatus}
                selectedCandidateId={selectedCandidateId}
                onChooseCandidate={chooseCandidate}
              />
            ))}
            {isSending && <div className="message-row assistant"><div className="avatar"></div><div className="bubble typing"><span></span><span></span><span></span></div></div>}
          </div>
          {error && <p className="error-banner">{error}</p>}
          <form className="composer" onSubmit={handleChatSubmit}>
            <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendUserMessage(chatInput) } }} placeholder="Reply to Luminous..." rows={1} />
            <button type="submit" disabled={!chatInput.trim() || isSending}>Send</button>
          </form>
        </div>
      </section>
    </main>
  )
}

function Message({
  message,
  importFile,
  setImportFile,
  showHelp,
  setShowHelp,
  uploadHistory,
  startConnection,
  importStatus,
  selectedCandidateId,
  onChooseCandidate,
}: {
  message: ChatMessage
  importFile: File | null
  setImportFile: (file: File | null) => void
  showHelp: boolean
  setShowHelp: (value: boolean) => void
  uploadHistory: () => Promise<void>
  startConnection: () => Promise<void>
  importStatus: string
  selectedCandidateId: string
  onChooseCandidate: (requestId: string, candidate: Candidate) => Promise<void>
}) {
  return (
    <div className={`message-row ${message.role}`}>
      {message.role === 'assistant' && <div className="avatar"></div>}
      <div className="bubble">
        <p>{message.content}</p>
        {message.payload?.kind === 'upload_request' && (
          <div className="upload-card">
            <div className="upload-actions">
              <button type="button" onClick={() => setShowHelp(!showHelp)}>Context options</button>
              <button type="button" className="secondary" onClick={() => void startConnection()}>Skip for now</button>
            </div>
            {showHelp && <aside className="help-popover"><strong>{message.payload.infoTitle}</strong><p>{message.payload.infoBody}</p></aside>}
            <label className="file-pill" htmlFor="ai-history-file"><strong>{importFile?.name || 'Upload full export - best'}</strong><span>JSON, TXT, HTML, MD, or readable export snippet</span></label>
            <input id="ai-history-file" type="file" accept=".json,.txt,.html,.md,.zip" onChange={(event) => setImportFile(event.target.files?.[0] || null)} />
            <div className="upload-actions">
              <button type="button" onClick={() => void uploadHistory()}>Attach export</button>
              <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText('Please summarize my goals, interests, projects, strengths, working style, and the kinds of mentors or professional connections I should meet. Make it specific enough for a matching system.')}>Copy summary prompt</button>
            </div>
            {importStatus && <span className="upload-status">{importStatus}</span>}
          </div>
        )}
        {message.payload?.kind === 'connection_started' && (
          <ConnectionPayloadView
            onChooseCandidate={onChooseCandidate}
            payload={message.payload}
            selectedCandidateId={selectedCandidateId}
          />
        )}
      </div>
    </div>
  )
}

function ConnectionPayloadView({
  onChooseCandidate,
  payload,
  selectedCandidateId,
}: {
  onChooseCandidate: (requestId: string, candidate: Candidate) => Promise<void>
  payload: Extract<AssistantPayload, { kind: 'connection_started' }>
  selectedCandidateId: string
}) {
  return (
    <div className="connection-card">
      <strong>{payload.title}</strong>
      <p>{payload.text}</p>
      {payload.candidates?.length ? (
              <div className="candidate-list">
                {payload.candidates.map((candidate) => {
                  const isSelected = selectedCandidateId === candidate.id
                  const locked = Boolean(selectedCandidateId && !isSelected)
                  return (
                    <article className={`candidate-card ${isSelected ? 'selected' : ''}`} key={candidate.id}>
                      <div>
                        <span>{candidate.label}</span>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.currentRole}</small>
                      </div>
                      <p>{candidate.reason}</p>
                      <div className="candidate-actions">
                        <a href={candidate.linkedinUrl} rel="noreferrer" target="_blank">
                          Open LinkedIn
                        </a>
                        <button
                          disabled={locked || isSelected || !payload.requestId}
                          onClick={() => payload.requestId && void onChooseCandidate(payload.requestId, candidate)}
                          type="button"
                        >
                          {isSelected ? 'Selected' : 'Choose this person'}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <span>{payload.queuedEmails} consent emails queued</span>
            )}
      <small>{payload.note}</small>
    </div>
  )
}

function hydrateMessage(message: { role?: Role; content?: string; payload?: AssistantPayload }): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || ''),
    payload: message.payload,
  }
}

function makeAssistant(payload: AssistantPayload): ChatMessage {
  return { id: crypto.randomUUID(), role: 'assistant', content: payload.kind === 'connection_started' ? payload.text : payload.text, payload }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase())
}

function looksLikeLinkedin(text: string) {
  return /linkedin\.com\/(in|pub)\//i.test(text) || /no linkedin/i.test(text)
}

export default App
