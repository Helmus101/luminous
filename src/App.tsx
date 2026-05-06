import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { FormEvent } from 'react'
import './App.css'

// Master Prompt for AI History extraction - provides detailed context for professional matching
const MASTER_PROMPT = `You are a professional context extraction system for a mentor matching service called Luminous.

TASK: Generate a high-density professional profile summary that will be used for semantic matching with potential mentors.

Please create a structured summary by copying and pasting this prompt into ChatGPT or Claude:

---
CRAFT YOUR LUMINOUS PROFILE

To find you the ideal mentor connection, I need to understand your professional journey, working style, and what makes a mentor match truly valuable.

Please respond to each section below with specific, concrete details. Be honest about gaps — they help us match better.

1. PROFESSIONAL BACKGROUND
   - Current role and company (or last role if between positions)
   - Industry/sector you work in
   - 3-5 key responsibilities or accomplishments
   - Any notable transitions in your career and why

2. DOMAIN EXPERTISE
   - Primary skills you're known for
   - Industries or functions where you have deep experience
   - Any technical expertise or specialized knowledge
   - Languages (if relevant to your work)

3. WORKING STYLE & LEADERSHIP APPROACH
   - How you prefer to work (autonomous, collaborative, etc.)
   - Your management or leadership style
   - How you approach problem-solving
   - What you look for in professional relationships

4. CURRENT GOALS & CHALLENGES
   - What you're trying to achieve in your career or business
   - The specific challenge or gap you're trying to address
   - Why a mentor relationship would be valuable right now
   - What "success" looks like for you in this connection

5. IDEAL MENTOR PROFILE
   - Role/background of the mentor you want (e.g., founder, operator, investor)
   - Industry expertise that would be most valuable
   - Geographic preferences or constraints
   - What you hope to learn or gain from the relationship

6. CONTEXT SIGNALS
   - Education or credentials (if relevant to your goals)
   - Personal qualities that drive your work
   - Any constraints or non-negotiables
   - Networks or communities you're part of

Please be specific and concrete. Instead of "I want a mentor in hospitality," tell me whether you need operational expertise, investment perspective, or operator experience. The more specific you are, the better we can match you.
---`

type Role = 'user' | 'assistant'
type Screen = 'landing' | 'auth' | 'chat'
type FlowStage = 'name' | 'goal' | 'linkedin' | 'ai_history' | 'search'

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

type SearchQuota = {
  limit: number
  used: number
  remaining: number
  monthKey: string
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
  const [flowStage, setFlowStage] = useState<FlowStage>('name')
  const [authError, setAuthError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatSessionId, setChatSessionId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isDragover, setIsDragover] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [generatedProfile, setGeneratedProfile] = useState<unknown>(null)
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [selectedCandidateId, setSelectedCandidateId] = useState('')
  const [searchQuota, setSearchQuota] = useState<SearchQuota | null>(null)
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

   
  useEffect(() => {
    if (isAuthed && screen === 'chat') {
      // Fire and forget - quota fetch is not critical
      fetch('/api/quota', { headers: authHeaders() })
         
        .then(response => response.ok ? response.json() : null)
         
        .then(data => { if (data?.quota) setSearchQuota(data.quota) })
        .catch(() => { /* Silently fail quota fetch */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, screen])

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
      setFlowStage('goal')
      const loaded = await loadLatestChat(token)
      if (loaded) {
        setMessages(loaded.messages)
        setChatSessionId(loaded.chatSessionId)
        detectFlowStage(loaded.messages)
        if (heroQuery.trim()) {
          await sendUserMessage(heroQuery.trim(), { token, baseMessages: loaded.messages, skipAuthCheck: true })
        }
        return
      }
      await startChatAfterName(firstName, token)
    } else {
      setFlowStage('name')
      setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: 'Before we start, what should I call you?' }])
    }
  }

  function detectFlowStage(msgs: ChatMessage[]) {
    const combined = msgs.map(m => m.content).join(' ').toLowerCase()
    if (/linkedin\.com|linkedin profile/i.test(combined)) {
      setFlowStage('linkedin')
    }
    if (/upload|export|attached|chatgpt|claude/i.test(combined)) {
      setFlowStage('ai_history')
    }
  }

  async function startChatAfterName(name: string, token = accessToken) {
    setError(null)
    const intro: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Nice to meet you, ${name}. I'm here to help you find the right person through a private, double opt-in process.`,
    }
    setMessages([intro])

    if (heroQuery.trim()) {
      const goal: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: heroQuery.trim() }
      setMessages([intro, goal])
      setFlowStage('goal')
      await requestChat([intro, goal], token, '')
    } else {
      setTimeout(async () => {
        const nextMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Who do you want to find, and what would make this connection useful?'
        }
        setMessages(prev => [...prev, nextMsg])
        setFlowStage('goal')
      }, 300)
    }
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

    // Secret command to reset everything
    if (clean === 'deleteall--00') {
      setMessages([])
      setChatSessionId('')
      setFlowStage('name')
      setChatInput('')
      try {
        await fetch('/api/chat/all', { method: 'DELETE', headers: authHeaders() })
        setMessages([{ id: crypto.randomUUID(), role: 'assistant', content: 'History cleared. What should I call you?' }])
      } catch {
        setError('Could not clear history on server.')
      }
      return
    }

    const activeToken = options.token || accessToken
    if (!options.skipAuthCheck && !isAuthed) {
      setScreen('auth')
      return
    }

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: clean }
    const next = [...(options.baseMessages || messages), userMessage]
    setMessages(next)
    setChatInput('')

    if (flowStage === 'name') {
      const name = clean.split(/\s+/)[0]
      try {
        const response = await fetch('/api/user-profile', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ fullName: clean }),
        })
        if (!response.ok) throw new Error('Could not save your name.')
        setDisplayName(name)
        localStorage.setItem(NAME_KEY, name)
        setFlowStage('goal')
        const followUp: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Got it, ${name}. Who do you want to find, and what would make this connection useful?`
        }
        setMessages(prev => [...prev, followUp])
      } catch {
        setError('Could not save your name. Try again.')
      }
      return
    }

    if (flowStage === 'goal') {
      setFlowStage('linkedin')
      const followUp: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I see. Please provide your LinkedIn profile URL so I can understand your background better.'
      }
      setMessages(prev => [...prev, followUp])
      return
    } else if (flowStage === 'linkedin' && looksLikeLinkedin(clean)) {
      setLinkedinUrl(clean)
      setFlowStage('ai_history')
      void extractLinkedin(clean)
    } else if (flowStage === 'linkedin') {
      // Mandatory LinkedIn check
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'LinkedIn is required to proceed. Please provide a valid LinkedIn URL (e.g., https://linkedin.com/in/yourname).'
      }
      setMessages(prev => [...prev, errorMsg])
      return
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
          flowStage,
          messages: history.map(({ role, content, payload }) => ({ role, content, payload })),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Luminous got stuck.')
      if (data.chatSessionId) setChatSessionId(String(data.chatSessionId))

      const assistantMsg = makeAssistant(data.message)
      setMessages((current) => [...current, assistantMsg])

      if (data.message?.kind === 'upload_request') {
        setFlowStage('ai_history')
      }
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
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `${data.profile.summary} I'll use that as context for the search.`
      }
      setMessages(current => [...current, msg])
    }
  }

  async function uploadHistory() {
    if (!importFile) {
      setImportStatus('Choose a file first.')
      return
    }
    setImportStatus('Reading export...')
    const snippet = (await importFile.text()).slice(0, 8000)
    try {
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
      if (!response.ok) throw new Error(data.message || 'Could not import that file.')
      setGeneratedProfile(data.generatedProfile)
      setImportStatus('Profile built. Starting search...')
      setFlowStage('search')
      await startConnection(data.generatedProfile)
    } catch (caught) {
      setImportStatus(caught instanceof Error ? caught.message : 'Could not import that file.')
    }
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
      if (!response.ok) {
        if (response.status === 429) {
          setError('You have used your 3 searches for this month. Come back next month for more.')
        } else {
          throw new Error(data.message || 'Could not start search.')
        }
        return
      }
      setSearchQuota(data.quota)
      setMessages((current) => [
        ...current,
        makeAssistant({
          kind: 'connection_started',
          title: 'Search complete',
          text: 'I found a few possible candidates. Choose one person and I\'ll queue outreach to see if they\'re interested.',
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
        text: `I've queued outreach to ${candidate.name}. I'll let you know if they're interested.`,
      }),
    ])
  }

  function getQuotaDisplay() {
    if (!searchQuota) return null
    const remaining = searchQuota.remaining
    if (remaining === 0) {
      return <span className="quota-badge empty"><span className="quota-dot" /> 0 searches left</span>
    }
    if (remaining === 1) {
      return <span className="quota-badge warning"><span className="quota-dot" /> {remaining} search left</span>
    }
    return <span className="quota-badge"><span className="quota-dot" /> {remaining} searches left</span>
  }

  if (screen === 'landing') {
    return (
      <main className="app-shell">
        <section className="landing-view">
          <div className="landing-content">
            <div className="landing-logo" />
            <p className="landing-eyebrow">Private mentor matching</p>
            <h1 className="landing-title">Find your next connection through people you trust.</h1>
            <p className="landing-subtitle">
              Luminous clarifies your goal, learns your context, then runs a private double opt-in search.
            </p>
          </div>
          <form className="landing-form" onSubmit={handleHeroSubmit}>
            <div className="landing-input-wrapper">
              <input
                className="landing-input"
                type="text"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                placeholder="A Paris hospitality operator who understands luxury real estate..."
              />
              <button type="submit" className="landing-submit" disabled={!heroQuery.trim()}>
                Start
              </button>
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
          <div className="auth-card">
            <h1 className="auth-header">{authMode === 'signup' ? 'Create account' : 'Sign in'}</h1>
            <p className="auth-subtext">Continue privately with your search.</p>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="auth-field">
                <label className="auth-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="auth-toggle">
                <button
                  type="button"
                  className={authMode === 'signin' ? 'active' : ''}
                  onClick={() => setAuthMode('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  className={authMode === 'signup' ? 'active' : ''}
                  onClick={() => setAuthMode('signup')}
                >
                  Create
                </button>
              </div>
              <button type="submit" className="auth-submit">
                {authMode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
              {authError && <p className="auth-error">{authError}</p>}
            </form>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="chat-view">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-logo" />
            {getQuotaDisplay()}
          </div>
        </header>
        <div className="chat-window">
          <div className="transcript" ref={transcriptRef}>
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                importFile={importFile}
                setImportFile={setImportFile}
                isDragover={isDragover}
                setIsDragover={setIsDragover}
                uploadHistory={uploadHistory}
                importStatus={importStatus}
                selectedCandidateId={selectedCandidateId}
                onChooseCandidate={chooseCandidate}
              />
            ))}
            {isSending && (
              <div className="message-row assistant">
                <div className="avatar" />
                <div className="bubble typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
          {error && <p className="error-banner">{error}</p>}
          <form className="composer" onSubmit={handleChatSubmit}>
            <div className="composer-inner">
              <textarea
                className="composer-textarea"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendUserMessage(chatInput)
                  }
                }}
                placeholder="Reply to Luminous..."
                rows={1}
              />
              <button type="submit" className="composer-send" disabled={!chatInput.trim() || isSending}>
                <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
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
  isDragover,
  setIsDragover,
  uploadHistory,
  importStatus,
  selectedCandidateId,
  onChooseCandidate,
}: {
  message: ChatMessage
  importFile: File | null
  setImportFile: (file: File | null) => void
  isDragover: boolean
  setIsDragover: (value: boolean) => void
  uploadHistory: () => Promise<void>
  importStatus: string
  selectedCandidateId: string
  onChooseCandidate: (requestId: string, candidate: Candidate) => Promise<void>
}) {
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragover(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragover(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragover(false)
    const file = e.dataTransfer.files?.[0]
    if (file) setImportFile(file)
  }

  return (
    <div className={`message-row ${message.role}`}>
      {message.role === 'assistant' && <div className="avatar" />}
      <div className="bubble">
        <p>{message.content}</p>
        {message.payload?.kind === 'upload_request' && (
          <div className="upload-card">
            <h3 className="upload-title">Add context (required)</h3>
            <p className="upload-description">
              This step is required for matching. The best results come from using the Master Prompt to generate a structured summary in ChatGPT or Claude, then pasting the result here.
            </p>
            <div className="upload-options">
              <button
                type="button"
                className="upload-btn primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(MASTER_PROMPT)
                    // Show feedback
                    const btn = document.activeElement as HTMLButtonElement
                    if (btn) {
                      const original = btn.textContent
                      btn.textContent = 'Copied!'
                      btn.classList.add('copied')
                      setTimeout(() => {
                        btn.textContent = original
                        btn.classList.remove('copied')
                      }, 2000)
                    }
                  } catch {
                    // Fallback for environments where clipboard API isn't available
                    const textarea = document.createElement('textarea')
                    textarea.value = MASTER_PROMPT
                    textarea.style.position = 'fixed'
                    textarea.style.opacity = '0'
                    document.body.appendChild(textarea)
                    textarea.select()
                    document.execCommand('copy')
                    document.body.removeChild(textarea)
                    const btn = document.activeElement as HTMLButtonElement
                    if (btn) {
                      const original = btn.textContent
                      btn.textContent = 'Copied!'
                      setTimeout(() => { btn.textContent = original }, 2000)
                    }
                  }
                }}
              >
                Copy Master Prompt
              </button>
            </div>
            <div
              className={`file-drop ${isDragover ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <label className="file-drop-label">
                {importFile ? importFile.name : 'Paste AI summary or drop file'}
              </label>
              <span className="file-drop-hint">Paste ChatGPT/Claude output or drop JSON, TXT, HTML, MD export</span>
              <input
                type="file"
                accept=".json,.txt,.html,.md,.zip"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>
            {importFile && (
              <button type="button" className="upload-btn primary" onClick={() => void uploadHistory()}>
                Process export
              </button>
            )}
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
      <h3 className="connection-header">{payload.title}</h3>
      <p className="connection-subtext">{payload.text}</p>
      <div className="outreach-flow">
        <span className={`outreach-step ${selectedCandidateId ? 'done' : 'active'}`}>
          <span className="outreach-step-indicator" />
          {selectedCandidateId ? 'Candidate selected' : 'Selection pending'}
        </span>
        <span className="outreach-step-arrow">→</span>
        <span className={`outreach-step ${selectedCandidateId ? 'active' : ''}`}>
          <span className="outreach-step-indicator" />
          {selectedCandidateId ? 'Outreach queued' : 'Waiting'}
        </span>
        <span className="outreach-step-arrow">→</span>
        <span className="outreach-step">
          <span className="outreach-step-indicator" />
          Consent given
        </span>
      </div>
      {payload.candidates?.length ? (
        <div className="candidate-list">
          {payload.candidates.map((candidate) => {
            const isSelected = selectedCandidateId === candidate.id
            const locked = Boolean(selectedCandidateId && !isSelected)
            return (
              <article className={`candidate-card ${isSelected ? 'selected' : ''}`} key={candidate.id}>
                <div className="candidate-card-header">
                  <div>
                    <div className="candidate-name">{candidate.name}</div>
                    <div className="candidate-role">{candidate.currentRole}</div>
                  </div>
                  <span className="candidate-label">{candidate.label}</span>
                </div>
                <p className="candidate-reason">{candidate.reason}</p>
                <div className="candidate-actions">
                  <a href={candidate.linkedinUrl} rel="noreferrer noopener" target="_blank" className="candidate-btn">
                    LinkedIn
                  </a>
                  <button
                    type="button"
                    className={`candidate-btn primary ${isSelected ? '' : ''}`}
                    disabled={locked || isSelected || !payload.requestId}
                    onClick={() => payload.requestId && void onChooseCandidate(payload.requestId, candidate)}
                  >
                    {isSelected ? 'Selected' : 'Choose'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <span>{payload.queuedEmails} consent emails queued</span>
      )}
      <p className="connection-note">{payload.note}</p>
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
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: payload.kind === 'connection_started' ? payload.text : payload.text,
    payload,
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase())
}

function looksLikeLinkedin(text: string) {
  return /^https?:\/\/(www\.)?linkedin\.com\/(in|pub)\/[a-z0-9%_-]+\/?/i.test(text.trim())
}

export default App