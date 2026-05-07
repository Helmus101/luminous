import { useEffect, useRef, useState, useCallback } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'

type Role = 'user' | 'assistant'
type Screen = 'landing' | 'auth' | 'chat' | 'discovery' | 'waitlist'

type AssistantPayload =
  | { kind: 'text'; text: string }
  | { kind: 'upload_request'; infoTitle: string; infoBody: string }
  | { kind: 'reset' }
  | {
      kind: 'connection_started'
      title: string
      text: string
      note: string
      candidates?: { id: string; name: string; reason: string; linkedinUrl: string }[]
    }

type Scout = {
  id: string
  name: string
  current_role_text: string
}

type Campus = {
  id: string
  name: string
  slug: string
  vibe: string
  insider_hooks: string[]
  location: string
  scouts: Scout[]
  baseline?: {
    topPrograms: string[]
    deadlines: string
    notableAlumni: string[]
  }
  sentiment?: {
    hiddenGem: string
    realityCheck: string
    networkMap: string
  }
  contributionStats?: {
    verifiedNotes: number
    pendingReview: number
    lastUpdated: string
  }
}

type DiscoveryContentProps = {
  campuses: Campus[]
  loadingCampuses: boolean
  onWarmIntro: (campusName: string) => void
  onOpenCampus: (slug: string) => void
  activeSlug?: string
  signedInEmail?: string
}

type ChatMessage = {
  id: string
  role: Role
  content: string
  payload?: AssistantPayload
}

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi, I'm Luminous. What should I call you?",
}

const campusFallback: Campus[] = [
  {
    id: 'upenn',
    name: 'UPenn',
    slug: 'upenn',
    vibe: 'Finance-heavy, club-driven, fast network formation.',
    insider_hooks: ['Collaborative: 85%', 'Intensity: High', 'Social vibe: Structured'],
    location: 'Philadelphia, PA',
    baseline: {
      topPrograms: ['Finance', 'Economics', 'Management', 'Computer Science'],
      deadlines: 'Regular decision typically closes in early January.',
      notableAlumni: ['Sundar Pichai network paths', 'Wharton finance operators', 'startup founders'],
    },
    sentiment: {
      hiddenGem: 'Huntsman study rooms are where a lot of finance recruiting prep actually happens.',
      realityCheck: 'Clubs shape the social graph fast; waiting until mid-semester can make access feel closed.',
      networkMap: 'Wharton finance clubs, M&T circles, and consulting groups are the strongest internship bridges.',
    },
    contributionStats: { verifiedNotes: 42, pendingReview: 6, lastUpdated: 'Updated this week' },
    scouts: [
      { id: 'upenn-1', name: 'Marc', current_role_text: 'Wharton finance scout' },
      { id: 'upenn-2', name: 'Sarah', current_role_text: 'Student founder' },
    ],
  },
  {
    id: 'berkeley',
    name: 'Berkeley',
    slug: 'berkeley',
    vibe: 'Builder energy, technical depth, and public-sector edge.',
    insider_hooks: ['Collaborative: 78%', 'Intensity: High', 'Hidden gem: Free Speech Movement Cafe'],
    location: 'Berkeley, CA',
    baseline: {
      topPrograms: ['Computer Science', 'AI', 'Public Policy', 'Climate Tech'],
      deadlines: 'UC applications usually close in late November.',
      notableAlumni: ['AI researchers', 'climate founders', 'public-sector builders'],
    },
    sentiment: {
      hiddenGem: 'The strongest builder circles form around labs, hackathons, and small technical clubs.',
      realityCheck: 'Opportunity is everywhere, but students need to self-navigate aggressively.',
      networkMap: 'EECS labs, SkyDeck, climate clubs, and startup houses drive the warmest tech intros.',
    },
    contributionStats: { verifiedNotes: 38, pendingReview: 4, lastUpdated: 'Updated yesterday' },
    scouts: [
      { id: 'berkeley-1', name: 'Nina', current_role_text: 'AI product scout' },
      { id: 'berkeley-2', name: 'Leo', current_role_text: 'Climate tech scout' },
    ],
  },
  {
    id: 'hec',
    name: 'HEC Paris',
    slug: 'hec-paris',
    vibe: 'International, consulting-oriented, and deeply relationship-led.',
    insider_hooks: ['Collaborative: 81%', 'Intensity: Medium-high', 'Network map: Consulting clubs'],
    location: 'Jouy-en-Josas, France',
    baseline: {
      topPrograms: ['Management', 'Luxury Strategy', 'Finance', 'Entrepreneurship'],
      deadlines: 'Application cycles vary by program and intake.',
      notableAlumni: ['Luxury executives', 'consulting partners', 'European founders'],
    },
    sentiment: {
      hiddenGem: 'Student associations are the real operating system of campus life.',
      realityCheck: 'The campus can feel isolated unless students proactively build their circles.',
      networkMap: 'Consulting clubs, luxury associations, and alumni dinners drive most high-quality intros.',
    },
    contributionStats: { verifiedNotes: 29, pendingReview: 3, lastUpdated: 'Updated 3 days ago' },
    scouts: [
      { id: 'hec-1', name: 'Camille', current_role_text: 'Luxury strategy scout' },
      { id: 'hec-2', name: 'Adrien', current_role_text: 'Consulting scout' },
    ],
  },
]

function screenFromPath(pathname: string): Screen {
  if (pathname.startsWith('/signin')) return 'auth'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/discovery')) return 'discovery'
  if (pathname.startsWith('/waitlist')) return 'waitlist'
  return 'landing'
}

function enrichCampus(campus: Campus): Campus {
  const fallback = campusFallback.find(item => item.slug === campus.slug || item.name === campus.name)
  return {
    ...fallback,
    ...campus,
    baseline: campus.baseline || fallback?.baseline || {
      topPrograms: ['Business', 'Technology', 'Policy'],
      deadlines: 'Application timing varies by program.',
      notableAlumni: ['Founders', 'operators', 'sector specialists'],
    },
    sentiment: campus.sentiment || fallback?.sentiment || {
      hiddenGem: campus.insider_hooks?.[0] || 'Students are still adding hidden gems for this profile.',
      realityCheck: campus.vibe || 'The strongest insights come from verified students on campus.',
      networkMap: campus.insider_hooks?.[1] || 'Club and alumni paths are being mapped by the community.',
    },
    contributionStats: campus.contributionStats || fallback?.contributionStats || {
      verifiedNotes: campus.insider_hooks?.length || 0,
      pendingReview: 0,
      lastUpdated: 'Community profile in progress',
    },
    scouts: campus.scouts || fallback?.scouts || [],
    insider_hooks: campus.insider_hooks || fallback?.insider_hooks || [],
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase())
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('luminous-session')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function isPublicPath(pathname: string) {
  return pathname === '/' || pathname.startsWith('/signin') || pathname.startsWith('/waitlist')
}

function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)
  const [screen, setScreen] = useState<Screen>(() => {
    const path = window.location.pathname
    return !isPublicPath(path) && !localStorage.getItem('luminous-email') ? 'auth' : screenFromPath(path)
  })
  const [heroQuery, setHeroQuery] = useState('')
  const [waitlistEmail, setWaitlistEmail] = useState(() => localStorage.getItem('luminous-email') || '')
  const [waitlistStatus, setWaitlistStatus] = useState<string | null>(null)
  const [email, setEmail] = useState(() => localStorage.getItem('luminous-email') || '')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [campuses, setCampuses] = useState<Campus[]>([])
  const [loadingCampuses, setLoadingCampuses] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path)
    setCurrentPath(path)
    setScreen(screenFromPath(path))
  }, [])

  const fetchLatestChat = useCallback(async (userEmail: string) => {
    try {
      const resp = await fetch(`/api/chat/latest?email=${encodeURIComponent(userEmail)}`, {
        headers: authHeaders(),
      })
      if (resp.ok) {
        const data = await resp.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((m: ChatMessage, i: number) => ({...m, id: m.id || `h-${i}`})))
        }
      }
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname)
      setScreen(screenFromPath(window.location.pathname))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const isSignedIn = Boolean(localStorage.getItem('luminous-email'))
    if (!isPublicPath(window.location.pathname) && screen !== 'auth' && !isSignedIn) {
      const path = window.location.pathname
      if (path !== '/signin') {
        localStorage.setItem('luminous-post-login-path', path)
      }
      const timer = setTimeout(() => navigate('/signin'), 0)
      return () => clearTimeout(timer)
    }
  }, [navigate, screen])

  useEffect(() => {
    const storedEmail = localStorage.getItem('luminous-email')
    if (storedEmail && screen === 'chat') {
      // Small timeout to avoid synchronous setState warning in effect
      const timer = setTimeout(() => {
        fetchLatestChat(storedEmail)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [fetchLatestChat, screen])

  useEffect(() => {
    if (transcriptRef.current) {
        transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [messages, isSending])

  const fetchCampuses = useCallback(async () => {
    setLoadingCampuses(true)
    try {
      const resp = await fetch('/api/campuses', {
        headers: authHeaders(),
      })
      if (resp.ok) {
        const data = await resp.json()
        setCampuses((data.length ? data : campusFallback).map(enrichCampus))
      }
    } catch (err) {
      console.error('Failed to fetch campuses', err)
    } finally {
      setLoadingCampuses(false)
    }
  }, [])

  useEffect(() => {
    if (screen === 'discovery') {
      const timer = setTimeout(() => {
        fetchCampuses()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [fetchCampuses, screen])

  const sendUserMessage = useCallback(async (text: string) => {
    if (!text.startsWith('Analyzed LinkedIn:')) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
    }
    setIsSending(true)
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          messages: [
            ...messages.filter(m => !m.id.startsWith('h-')),
            { role: 'user', content: text },
          ],
          email: email,
        }),
      })
      const data = await response.json()
      
      if (data.payload?.kind === 'reset') {
          localStorage.removeItem('luminous-email')
          window.location.reload()
          return
      }

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: data.text,
        payload: data.payload 
      }])
    } catch {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: "Sorry, I encountered an error. Please try again." 
      }])
    } finally {
      setIsSending(false)
    }
  }, [messages, email])

  const handleHeroSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!heroQuery.trim()) return
    setHeroQuery('')
    navigate('/waitlist')
  }

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValidEmail(email)) {
      setAuthError('Valid email please.')
      return
    }
    setAuthError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setAuthError(data.error || 'Could not sign in with those details.')
        return
      }

      if (data.accessToken) {
        localStorage.setItem('luminous-session', data.accessToken)
      }
    } catch {
      setAuthError('Could not reach authentication. Try again in a moment.')
      return
    }

    localStorage.setItem('luminous-email', email)
    const postLoginPath = localStorage.getItem('luminous-post-login-path')
    localStorage.removeItem('luminous-post-login-path')
    navigate(postLoginPath && postLoginPath !== '/signin' ? postLoginPath : '/chat')
    const pendingPrompt = localStorage.getItem('luminous-pending-chat') || ''
    if (pendingPrompt) {
       localStorage.removeItem('luminous-pending-chat')
       sendUserMessage(pendingPrompt)
    } else {
       fetchLatestChat(email)
    }
  }

  const handleChatSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || isSending) return
    
    if (text === 'deleteall--00') {
        await sendUserMessage(text)
        localStorage.removeItem('luminous-email')
        window.location.reload()
        return
    }

    if (text.toLowerCase().includes('linkedin.com/')) {
      const userMsgId = crypto.randomUUID()
      setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text }])
      setIsSending(true)
      
      try {
        const extractResponse = await fetch('/api/linkedin-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            linkedinUrl: text,
            conversationText: messages.map(message => message.content).join('\n'),
          })
        })
        const extractData = await extractResponse.json().catch(() => ({}))
        const profileSummary = extractData.profile?.summary
          ? `\nSaved LinkedIn profile summary: ${extractData.profile.summary}`
          : ''
        await sendUserMessage(`Analyzed LinkedIn: ${text}${profileSummary}`)
      } catch {
          await sendUserMessage(text)
      } finally {
        setIsSending(false)
      }
    } else {
      await sendUserMessage(text)
    }
    setChatInput('')
  }, [chatInput, isSending, messages, sendUserMessage])

  const handleSelectCandidate = async (candidateId: string, candidateName: string) => {
    setIsSending(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: `Select ${candidateName}` }],
          email: email,
        }),
      })
      const data = await response.json()

      if (response.status === 429) {
        setMessages(prev => [...prev, { 
          id: crypto.randomUUID(), 
          role: 'user', 
          content: `Select ${candidateName}` 
        }, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.text
        }])
        return
      }

      await fetch('/api/intros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ email, candidateId })
      })

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'user', 
        content: `Select ${candidateName}` 
      }, {
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: `Excellent choice. I've initiated the double opt-in process with ${candidateName}. I'll notify you once they accept.` 
      }])
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  const handleWarmIntro = (campusName: string) => {
    const campus = (campuses.length ? campuses : campusFallback).map(enrichCampus).find(item => item.name === campusName)
    const prompt = campus
      ? `Use this campus discovery context for ${campus.name}: vibe: ${campus.vibe}; hidden gem: ${campus.sentiment?.hiddenGem}; reality check: ${campus.sentiment?.realityCheck}; network map: ${campus.sentiment?.networkMap}. Help me decide whether I should get a warm intro to an active student scout.`
      : `Ask Luminous about the ${campusName} campus pulse and help me get a warm intro to an active scout.`
    if (!localStorage.getItem('luminous-email')) {
      localStorage.setItem('luminous-pending-chat', prompt)
      navigate('/signin')
      return
    }
    navigate('/chat')
    setChatInput(prompt)
  }

  const handleOpenCampus = (slug: string) => {
    navigate(`/discovery/${slug}`)
  }

  const handleLogout = () => {
    localStorage.removeItem('luminous-email')
    localStorage.removeItem('luminous-pending-chat')
    localStorage.removeItem('luminous-session')
    setEmail('')
    setPassword('')
    setMessages([welcomeMessage])
    navigate('/')
  }

  const handleWaitlistSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setWaitlistStatus(null)
    if (!isValidEmail(waitlistEmail)) {
      setWaitlistStatus('Use a valid email to join the waitlist.')
      return
    }

    const response = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: waitlistEmail, source: 'landing' }),
    })

    if (!response.ok) {
      setWaitlistStatus('Could not save that yet. Try again in a moment.')
      return
    }

    setWaitlistStatus('You are on the waitlist.')
  }

  if (screen === 'landing') {
    return (
      <div className="app-shell">
        <header className="landing-header">
            <div className="landing-header-inner">
                <div className="chat-header-left">
                    <div className="chat-header-logo"></div>
                    <span style={{fontWeight: 700, fontSize: '18px'}}>Luminous</span>
                </div>
                <nav className="landing-nav">
                  <button className="landing-header-signin" onClick={() => navigate('/signin')}>Sign In</button>
                </nav>
            </div>
        </header>
        <main className="landing-view">
            <div className="landing-content">
                <div className="landing-logo"></div>
                <p className="landing-eyebrow">Private intelligence for warm intros</p>
                <h1 className="landing-title">Find the right person before you ask for an intro</h1>
                <p className="landing-subtitle">
                    Luminous turns a vague goal into a precise mentor search, checks the network, and protects every introduction with double opt-in.
                </p>
                <div className="landing-proof">
                  <span>Goal clarification</span>
                  <span>AI-history context</span>
                  <span>Private consent</span>
                </div>
                <form className="landing-form" onSubmit={handleHeroSubmit}>
                    <div className="landing-input-wrapper">
                        <input 
                            className="landing-input"
                            type="text" 
                            placeholder="What are you looking for?"
                            value={heroQuery}
                            onChange={(e) => setHeroQuery(e.target.value)}
                        />
                        <button type="submit" className="landing-submit" disabled={!heroQuery.trim()}>
                            Join waitlist
                        </button>
                    </div>
                </form>
                <section className="landing-explainer" aria-label="How Luminous works">
                  <article>
                    <span>01</span>
                    <h2>Discover the real campus layer</h2>
                    <p>University profiles combine public facts with what verified students say about clubs, workload, social systems, and hidden opportunities.</p>
                  </article>
                  <article>
                    <span>02</span>
                    <h2>Ask with context</h2>
                    <p>When you open a profile, Luminous carries the campus pulse into chat so your questions start from useful local intelligence.</p>
                  </article>
                  <article>
                    <span>03</span>
                    <h2>Get introduced carefully</h2>
                    <p>If the fit is strong, Luminous drafts a double opt-in path so neither side is exposed before they agree to connect.</p>
                  </article>
                </section>
                <section className="landing-note">
                  <strong>Built from community signal.</strong>
                  Students contribute by talking to the AI. Luminous reviews the input first, then decides whether it belongs on a university profile.
                </section>
            </div>
        </main>
      </div>
    )
  }

  if (screen === 'waitlist') {
    return (
      <div className="auth-view waitlist-view">
        <div className="auth-card waitlist-card">
          <button className="auth-back" onClick={() => navigate('/')}>← Back</button>
          <p className="landing-eyebrow">Waitlist</p>
          <h2 className="auth-header">Join the private beta.</h2>
          <p className="auth-subtext">Luminous is still invite-only. Add your email and start fresh when your account opens.</p>
          <form className="auth-form" onSubmit={handleWaitlistSubmit}>
            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input className="auth-input" type="email" value={waitlistEmail} onChange={(e) => setWaitlistEmail(e.target.value)} required />
            </div>
            <button type="submit" className="auth-submit">Join waitlist</button>
            {waitlistStatus && <p className="auth-error neutral">{waitlistStatus}</p>}
          </form>
        </div>
      </div>
    )
  }

  if (screen === 'auth') {
    return (
      <div className="auth-view">
        <div className="auth-card">
          <button className="auth-back" onClick={() => {
            localStorage.removeItem('luminous-post-login-path')
            navigate('/')
          }}>← Back</button>
          <h2 className="auth-header">Sign in</h2>
          <p className="auth-subtext">Existing members can continue into the private chat.</p>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="auth-field">
                <label className="auth-label">Email Address</label>
                <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="auth-field">
                <label className="auth-label">Password</label>
                <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {authError && <p className="auth-error">{authError}</p>}
            <button type="submit" className="auth-submit">
              Sign In
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (screen === 'discovery') {
    return (
      <div className="chat-view discovery-page">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-logo"></div>
            <span style={{fontWeight: 600}}>Luminous Discovery</span>
          </div>
          <nav className="tabs-nav">
            <button className="tab-btn" onClick={() => navigate('/')}>Home</button>
            <button className="tab-btn active">Discovery</button>
            <button className="tab-btn" onClick={() => navigate(localStorage.getItem('luminous-email') ? '/chat' : '/signin')}>Chat</button>
          </nav>
        </header>
        <DiscoveryContent
          campuses={(campuses.length ? campuses : campusFallback).map(enrichCampus)}
          loadingCampuses={loadingCampuses}
          onWarmIntro={handleWarmIntro}
          onOpenCampus={handleOpenCampus}
          activeSlug={currentPath.split('/')[2]}
          signedInEmail={localStorage.getItem('luminous-email') || ''}
        />
      </div>
    )
  }

  return (
    <div className="chat-view">
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-logo"></div>
          <span style={{fontWeight: 600}}>Luminous AI</span>
        </div>

        <nav className="tabs-nav">
            <button 
                className="tab-btn active"
                onClick={() => navigate('/chat')}
            >
                Chat
            </button>
            <button 
                className="tab-btn"
                onClick={() => navigate('/discovery')}
            >
                Discovery
            </button>
        </nav>

        <div className="chat-header-actions">
          <div className="quota-badge">
            <div className="quota-dot"></div>
            Introductions
          </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      
        <div className="chat-window">
            <div className="transcript" ref={transcriptRef}>
                {messages.map((m) => (
                <div key={m.id} className={`message-row ${m.role}`}>
                    <div className="avatar"></div>
                    <div className="bubble">
                    {m.content}
                    
                    {m.payload?.kind === 'upload_request' && (
                        <div className="upload-card">
                        <h3 className="upload-title">{m.payload.infoTitle}</h3>
                        <p className="upload-description">{m.payload.infoBody}</p>
                        <p className="upload-description">
                          For LinkedIn, paste the visible profile sections if you want the strongest extraction: About, Experience, Education, Skills, projects, and certifications. Luminous saves the structured summary to your private profile.
                        </p>
                        <div className="upload-options">
                            <button className="upload-btn primary" onClick={() => sendUserMessage("I'll paste a brief summary")}>
                            Add Context
                            </button>
                            <button className="upload-btn" onClick={() => sendUserMessage("Skip & Search")}>
                            Skip & Search
                            </button>
                        </div>
                        </div>
                    )}

                    {m.payload?.kind === 'connection_started' && (
                        <div className="connection-card">
                        <h3 className="connection-header">{m.payload.title}</h3>
                        <p className="connection-subtext">{m.payload.text}</p>
                        
                        <div className="candidate-list">
                            {m.payload.candidates?.map((can, idx) => (
                                <div key={idx} className="candidate-card">
                                    <div className="candidate-card-header">
                                        <div>
                                            <div className="candidate-name">{can.name}</div>
                                        </div>
                                        <span className="candidate-label">Match</span>
                                    </div>
                                    <div className="candidate-reason">{can.reason}</div>
                                    <div className="candidate-actions">
                                        <a href={can.linkedinUrl} target="_blank" rel="noreferrer" className="candidate-btn">Profile</a>
                                        <button className="candidate-btn primary" onClick={() => handleSelectCandidate(can.id, can.name)}>
                                            Select
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="connection-note">{m.payload.note}</div>
                        </div>
                    )}
                    </div>
                </div>
                ))}
                {isSending && (
                <div className="message-row assistant">
                    <div className="avatar"></div>
                    <div className="typing">
                        <span></span><span></span><span></span>
                    </div>
                </div>
                )}
            </div>

            <div className="composer">
                <div className="composer-inner">
                    <form style={{display: 'flex', width: '100%', alignItems: 'flex-end'}} onSubmit={handleChatSubmit}>
                        <textarea 
                            className="composer-textarea"
                            placeholder="Type a message..." 
                            value={chatInput} 
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    const form = e.currentTarget.form;
                                    if (form) {
                                        const event = new Event('submit', { cancelable: true, bubbles: true });
                                        form.dispatchEvent(event);
                                    }
                                }
                            }}
                        />
                        <button type="submit" className="composer-send" disabled={!chatInput.trim() || isSending}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>
  )
}

function DiscoveryContent({ campuses, loadingCampuses, onWarmIntro, onOpenCampus, activeSlug, signedInEmail }: DiscoveryContentProps) {
  const [contributionText, setContributionText] = useState('')
  const [contributionStatus, setContributionStatus] = useState<string | null>(null)
  const [universitySearch, setUniversitySearch] = useState('')
  const contributionPrompts = [
    'What surprised you most about the social scene, and when did you realize it?',
    'Which clubs, classes, or spaces actually create opportunity?',
    'What would you tell an applicant about workload, stress, housing, food, and support?',
    'Where do students find their closest friends, mentors, or internship leads?',
  ]
  const filteredCampuses = campuses.filter((campus) => {
    const query = universitySearch.trim().toLowerCase()
    if (!query) return true
    return [campus.name, campus.location, campus.vibe, ...(campus.baseline?.topPrograms || [])]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
  const activeCampus = campuses.find(campus => campus.slug === activeSlug)
    || filteredCampuses[0]
    || campuses[0]

  const handleContribution = async (e: FormEvent) => {
    e.preventDefault()
    if (!activeCampus || !contributionText.trim()) return

    setContributionStatus('Luminous is checking whether this should update the campus profile.')
    const response = await fetch('/api/campus-contributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        campusSlug: activeCampus.slug,
        campusName: activeCampus.name,
        email: signedInEmail,
        input: contributionText,
      }),
    })
    const data = await response.json().catch(() => ({}))
    setContributionStatus(data.message || 'Contribution reviewed.')
    setContributionText('')
  }

  return (
    <main className="discovery-view">
      <section className="discovery-hero">
        <p className="landing-eyebrow">Community-built intelligence</p>
        <h1>Campus pulse, not static research.</h1>
        <p>
          University profiles are fueled by what students say about their own campus. Luminous turns those notes
          into verified signals, profile updates, and contextual chat prompts.
        </p>
        <div className="discovery-search">
          <input
            value={universitySearch}
            onChange={(e) => setUniversitySearch(e.target.value)}
            placeholder="Search universities, programs, or campus signals"
          />
          <span>{filteredCampuses.length} profiles</span>
        </div>
      </section>

      <section className="pulse-feed" aria-label="Campus pulse cards">
        {loadingCampuses && (
          <article className="pulse-card pulse-card-loading">
            <div className="pulse-card-inner">
              <span className="pulse-kicker">Loading</span>
              <h2>Reading campus signals</h2>
              <p>Pulling the latest mock pulse from the Luminous network.</p>
            </div>
          </article>
        )}

        {!loadingCampuses && filteredCampuses.map((campus, index) => (
          <article className={`pulse-card pulse-card-${index % 3}`} key={campus.id}>
            <div className="pulse-bg" />
            <div className="pulse-card-inner">
              <div className="pulse-topline">
                <span className="pulse-kicker">{campus.location}</span>
                <span className="pulse-live">Live</span>
              </div>
              <h2>{campus.name}</h2>
              <div className="pulse-metrics">
                {campus.insider_hooks.slice(0, 3).map((hook) => (
                  <span key={hook}>{hook}</span>
                ))}
              </div>
              <blockquote className="pulse-quote">"{campus.vibe}"</blockquote>
              <div className="pulse-scouts">
                <span>Active scouts</span>
                <div className="scout-stack">
                  {campus.scouts.slice(0, 3).map((scout) => (
                    <div className="scout-pill" key={scout.id}>
                      <strong>{scout.name}</strong>
                      <small>{scout.current_role_text}</small>
                    </div>
                  ))}
                </div>
              </div>
              <button className="pulse-action" onClick={() => onWarmIntro(campus.name)}>
                Ask Luminous about {campus.name}
              </button>
              <button className="pulse-action ghost" onClick={() => onOpenCampus(campus.slug)}>
                Open profile
              </button>
            </div>
          </article>
        ))}
      </section>

      {activeCampus && (
        <section className="university-profile">
          <div className="profile-hero-card">
            <p className="landing-eyebrow">{activeCampus.location}</p>
            <h2>{activeCampus.name}</h2>
            <p>{activeCampus.vibe}</p>
            <div className="profile-stats">
              <span>{activeCampus.contributionStats?.verifiedNotes} verified notes</span>
              <span>{activeCampus.contributionStats?.pendingReview} in AI review</span>
              <span>{activeCampus.contributionStats?.lastUpdated}</span>
            </div>
          </div>

          <div className="profile-context-bar">
            <div>
              <span>Search context</span>
              <strong>{activeCampus.name} is loaded into Luminous chat context.</strong>
            </div>
            <button onClick={() => onWarmIntro(activeCampus.name)}>Ask with this profile</button>
          </div>

          <div className="profile-depth-grid">
            <article className="profile-signal-card">
              <span>Live pulse</span>
              <h3>What students keep repeating</h3>
              <div className="signal-list">
                {activeCampus.insider_hooks.slice(0, 4).map((hook) => (
                  <div key={hook}>
                    <strong>{hook.split(':')[0]}</strong>
                    <small>{hook.includes(':') ? hook.split(':').slice(1).join(':').trim() : 'Student-reported signal'}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="profile-signal-card">
              <span>Contribution pipeline</span>
              <h3>How a student note becomes page intelligence</h3>
              <ol className="profile-timeline">
                <li>Student talks to Luminous from their campus context.</li>
                <li>AI checks specificity, usefulness, safety, and duplicate risk.</li>
                <li>Accepted notes become profile signals; weak notes stay private.</li>
              </ol>
            </article>
          </div>

          <div className="profile-grid">
            <article className="profile-panel">
              <span>Institutional baseline</span>
              <h3>Hard signals</h3>
              <ul>
                {activeCampus.baseline?.topPrograms.map(program => <li key={program}>{program}</li>)}
              </ul>
              <p>{activeCampus.baseline?.deadlines}</p>
              <p>{activeCampus.baseline?.notableAlumni.join(' · ')}</p>
            </article>
            <article className="profile-panel highlight">
              <span>Human sentiment</span>
              <h3>Student reality layer</h3>
              <p><strong>Hidden gem:</strong> {activeCampus.sentiment?.hiddenGem}</p>
              <p><strong>Reality check:</strong> {activeCampus.sentiment?.realityCheck}</p>
              <p><strong>Network map:</strong> {activeCampus.sentiment?.networkMap}</p>
            </article>
            <article className="profile-panel contribution-panel">
              <span>Student contribution</span>
              <h3>Talk to Luminous</h3>
              <p>Students do not edit this page directly. Share what you know across academics, people, pressure, social life, housing, food, clubs, recruiting, and support. Luminous reviews whether it is specific and useful enough to add.</p>
              <div className="contribution-prompts">
                {contributionPrompts.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    onClick={() => setContributionText((current) => current ? `${current}\n\n${prompt} ` : `${prompt} `)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <form onSubmit={handleContribution}>
                <textarea
                  value={contributionText}
                  onChange={(e) => setContributionText(e.target.value)}
                  placeholder={`Describe the real ${activeCampus.name} experience. Include what you like, what is difficult, where people gather, what creates opportunity, and what applicants misunderstand.`}
                />
                <button type="submit" disabled={!contributionText.trim()}>Submit for AI review</button>
              </form>
              {contributionStatus && <p className="contribution-status">{contributionStatus}</p>}
            </article>
          </div>

          <section className="profile-scout-directory">
            <div className="profile-section-heading">
              <span>Community builders</span>
              <h3>People who can explain the campus from inside</h3>
            </div>
            <div className="profile-scout-grid">
              {activeCampus.scouts.map((scout) => (
                <article key={scout.id} className="profile-scout-card">
                  <div className="profile-scout-avatar">{scout.name.charAt(0)}</div>
                  <div>
                    <strong>{scout.name}</strong>
                    <p>{scout.current_role_text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {!loadingCampuses && filteredCampuses.length === 0 && (
        <section className="empty-profile-state">
          <h2>No university profile found.</h2>
          <p>Try a broader search. Luminous can still capture the request and add it to the profile backlog.</p>
        </section>
      )}

      <section className="discovery-layers">
        <div>
          <span>01</span>
          <h3>Institutional baseline</h3>
          <p>Programs, deadlines, notable alumni, sector strengths, and public facts keep every campus page useful.</p>
        </div>
        <div>
          <span>02</span>
          <h3>Human sentiment</h3>
          <p>Student notes reveal the hidden gems, social systems, club maps, and reality checks that brochures miss.</p>
        </div>
        <div>
          <span>03</span>
          <h3>Connection loop</h3>
          <p>Every pulse can become a focused chat that asks whether a warm intro would actually help.</p>
        </div>
      </section>
    </main>
  )
}

export default App
