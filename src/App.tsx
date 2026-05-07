import { useEffect, useRef, useState, ReactNode, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link, useSearchParams } from 'react-router-dom'
import './App.css'
import DiscoveryContent from './DiscoveryContent'

type Role = 'user' | 'assistant'

interface Candidate {
  name: string;
  reason: string;
  linkedinUrl: string;
  description?: string;
}

type AssistantPayload =
  | { kind: 'text'; goal?: string }
  | { kind: 'candidates'; candidates: Candidate[] }
  | { kind: 'outreach_triggered'; candidateName: string }

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  payload?: AssistantPayload;
}

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Welcome to Weave. I build student-voice campus intelligence and connect people when it is useful. Before we begin, what should I call you?",
}

// --- MatchCard Component ---
function MatchCard({ candidate, onSelect }: { candidate: Candidate; onSelect: (name: string) => void }) {
  return (
    <div className="candidate-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h4>{candidate.name}</h4>
        <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>LinkedIn</a>
      </div>
      <p className="human-truth">{candidate.reason}</p>
      {candidate.description && <p className="candidate-reason">{candidate.description}</p>}
      <button onClick={() => onSelect(candidate.name)}>Request Intro</button>
    </div>
  )
}

// --- Protected Route Wrapper ---
function ProtectedRoute({ children, email }: { children: ReactNode; email: string }) {
  if (!email) {
    return <Navigate to="/signin" replace />
  }
  return <>{children}</>
}

// --- Main App Component ---
function App() {
  const [email, setEmail] = useState(() => localStorage.getItem('weave-email') || '')
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    localStorage.removeItem('weave-email');
    setEmail('');
  }

  useEffect(() => {
    if (!email) return
    let ignore = false
    const fetchLatestChat = async () => {
      try {
        const resp = await fetch(`/api/chat/latest?email=${encodeURIComponent(email)}`)
        if (resp.ok && !ignore) {
          const data = await resp.json()
          if (data.messages && data.messages.length > 0) setMessages(data.messages)
        }
      } catch (err) {
        console.error('History load failed', err)
      }
    }
    fetchLatestChat()
    return () => { ignore = true }
  }, [email])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const sendUserMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setIsSending(true)

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], email })
      })
      const data = await resp.json()
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.text, payload: data.payload }])
    } catch (err) {
      console.error('Chat error', err)
    } finally {
      setIsSending(false)
    }
  }, [messages, email])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<AuthPage email={email} setEmail={setEmail} />} />
        <Route path="/waitlist" element={<WaitlistPage />} />
        <Route 
          path="/chat" 
          element={
            <ProtectedRoute email={email}>
              <AuthenticatedLayout onLogout={handleLogout}>
                <ChatContainer 
                  messages={messages} 
                  transcriptRef={transcriptRef} 
                  sendUserMessage={sendUserMessage} 
                  chatInput={chatInput} 
                  setChatInput={setChatInput} 
                  isSending={isSending}
                />
              </AuthenticatedLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/discovery" 
          element={
            <ProtectedRoute email={email}>
              <AuthenticatedLayout onLogout={handleLogout}>
                <DiscoveryContent />
              </AuthenticatedLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/discovery/:slug" 
          element={
            <ProtectedRoute email={email}>
              <AuthenticatedLayout onLogout={handleLogout}>
                <DiscoveryContent />
              </AuthenticatedLayout>
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

// --- Page Components ---

function LandingPage() {
  const navigate = useNavigate()
  
  return (
    <div className="landing-weave-root">
      <nav className="landing-nav">
        <div className="nav-logo">
          <img src="/logo.png" alt="W" />
          <span>Weave</span>
        </div>
        <button className="nav-request-btn" onClick={() => navigate('/waitlist')}>Request access →</button>
      </nav>

      <main className="landing-hero-section">
        <div className="hero-content">
          <div className="badge-beta">Now in private beta</div>
          <h1 className="hero-title">
            The student network built on <em>human truth</em>, not institutional marketing.
          </h1>
          <p className="hero-description">
            Weave helps you discover universities through real student experience — and meet people who actually fit. Quiet, intentional, and built around warm introductions.
          </p>

          <div className="hero-cta-box">
             <div className="type-toggle">
                <button className="active">High school</button>
                <button>At university</button>
                <button>Curious</button>
             </div>
             <div className="input-row">
                <input type="text" placeholder="Your name" />
                <input type="email" placeholder="Email address" />
             </div>
             <button className="invite-btn" onClick={() => navigate('/waitlist')}>
               Request an invitation <span className="arrow">→</span>
             </button>
          </div>

          <div className="trusted-by-row">
            <span>Trusted by students at</span>
            <div className="trusted-logos">
              <span>Berkeley</span>
              <span>Cambridge</span>
              <span>Stanford</span>
            </div>
          </div>
        </div>
      </main>

      <section className="features-section">
        <h2 className="section-title">Students trust students more than brochures.</h2>
        <div className="features-grid">
           <article className="feature-card">
              <span className="feat-num">01</span>
              <h3>Conversation, not forms</h3>
              <p>Onboarding is a quiet dialogue. We learn who you are — your ambitions, your texture — through language, not checkboxes.</p>
           </article>
           <article className="feature-card">
              <span className="feat-num">02</span>
              <h3>What it actually feels like</h3>
              <p>Each university is built from real student voices: the social weather, the stress culture, the sense of belonging.</p>
           </article>
           <article className="feature-card">
              <span className="feat-num">03</span>
              <h3>Warm introductions only</h3>
              <p>We propose. Both sides opt in. Then a contextual introduction is made — meaningful, mutual, never transactional.</p>
           </article>
        </div>
      </section>

      <section className="thesis-section">
        <blockquote className="thesis-quote">
          “People don't choose universities only on academics. They choose on identity, belonging, and the quiet feeling of <em>people like me</em>.”
        </blockquote>
        <p className="thesis-attribution">— The Weave thesis</p>
      </section>

      <section className="bottom-cta-section">
         <h3>Real students. Real insight. Meaningful matches.</h3>
         <button className="bottom-join-btn" onClick={() => navigate('/waitlist')}>Join the waitlist →</button>
      </section>

      <footer className="landing-footer">
        <div className="footer-logo">
           <img src="/logo.png" alt="W" />
           <span>Weave</span>
        </div>
        <p>© 2026 Weave · Built for students, by students.</p>
        <Link to="/signin" className="footer-signin-link">Sign In</Link>
      </footer>
    </div>
  )
}

interface AuthPageProps {
  email: string;
  setEmail: (email: string) => void;
}

function AuthPage({ email, setEmail }: AuthPageProps) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      // Use window.location.hostname to support both localhost and network access
      const backendUrl = `http://${window.location.hostname}:3001/api/auth/signin`
      const resp = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await resp.json()
      if (resp.ok) {
        localStorage.setItem('weave-email', email)
        navigate('/chat')
      } else {
        setError(data.error || 'Authentication failed')
      }
    } catch (err) {
      console.error(err)
      setError('Connection error')
    }
  }

  return (
    <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="auth-panel">
        <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Welcome to Weave</h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '32px', fontSize: '14px' }}>We're currently in invite-only beta.<br/>Sign in to your account.</p>
        
        {error && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '13px', textAlign: 'center', fontWeight: 600 }}>{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Institutional Email</label>
            <input 
              type="email" 
              placeholder="you@university.edu" 
              value={email} 
              onChange={e => { setEmail(e.target.value); }} 
              required 
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button type="submit" className="auth-submit">Sign In</button>
            <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b', margin: '8px 0' }}>
              Don't have an account?
            </p>
            <button type="button" className="auth-waitlist-btn" onClick={() => navigate('/waitlist')}>Join Waitlist</button>
          </div>
        </form>
        <Link to="/" style={{ display: 'block', textAlign: 'center', color: '#94a3b8', marginTop: '24px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>← Back to Home</Link>
      </div>
    </div>
  )
}

function WaitlistPage() {
  const navigate = useNavigate()
  const [submitted, setSubmitted] = useState(false)
  
  return (
    <div className="landing-weave-root">
      <nav className="landing-nav">
        <div className="nav-logo" onClick={() => navigate('/')} style={{cursor:'pointer'}}>
          <img src="/logo.png" alt="W" />
          <span>Weave</span>
        </div>
      </nav>

      <main className="landing-hero-section" style={{minHeight: '70vh', display:'flex', alignItems:'center'}}>
        <div className="hero-content" style={{textAlign:'left', maxWidth:'500px'}}>
          {!submitted ? (
            <>
              <h1 className="hero-title" style={{fontSize: '3.5rem'}}>Join the <br/><em>inner circle</em>.</h1>
              <p className="hero-description">Weave is currently invite-only to maintain the quality of our community. Apply for access and we'll reach out shortly.</p>
              
              <form className="hero-cta-box" style={{margin:'0', textAlign:'left'}} onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
                <div className="input-row" style={{gridTemplateColumns:'1fr'}}>
                  <input type="text" placeholder="Full name" required style={{marginBottom:'8px'}}/>
                  <input type="email" placeholder="University or school email" required style={{marginBottom:'8px'}}/>
                  <input type="text" placeholder="What are you working on / studying?" required />
                </div>
                <button type="submit" className="invite-btn" style={{marginTop:'12px'}}>
                  Request Invitation
                </button>
              </form>
            </>
          ) : (
            <div className="success-state">
              <h1 className="hero-title" style={{fontSize: '3.5rem'}}>Thanks. <br/><em>Talk soon.</em></h1>
              <p className="hero-description">We've received your request. Check your inbox in a few days for a magic link if we have a spot available.</p>
              <button className="nav-request-btn" onClick={() => navigate('/')}>Return home</button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function AuthenticatedLayout({ children, onLogout }: { children: ReactNode, onLogout: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const activeTab = location.pathname.startsWith('/chat') ? 'chat' : 'discovery'

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="logo-group" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img src="/logo.png" alt="W" style={{ height: '32px' }} />
          <span>Weave</span>
        </div>
        <nav className="tabs-nav">
          <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => navigate('/chat')}>Chat</button>
          <button className={activeTab === 'discovery' ? 'active' : ''} onClick={() => navigate('/discovery')}>Discovery</button>
        </nav>
        <button 
          onClick={onLogout}
          style={{ 
            background: 'transparent', 
            border: '1px solid #e2e8f0', 
            padding: '6px 12px', 
            borderRadius: '8px', 
            fontSize: '12px', 
            fontWeight: 600, 
            color: '#64748b',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </header>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

interface ChatProps {
  messages: ChatMessage[];
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  sendUserMessage: (text: string) => Promise<void>;
  chatInput: string;
  setChatInput: (text: string) => void;
  isSending: boolean;
}

function ChatContainer({ messages, transcriptRef, sendUserMessage, chatInput, setChatInput, isSending }: ChatProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQueryHandled = useRef(false)

  useEffect(() => {
    const query = searchParams.get('q')
    if (query && !initialQueryHandled.current) {
      initialQueryHandled.current = true
      // Clear the query param
      setSearchParams({}, { replace: true })
      // Send the message
      sendUserMessage(query)
    }
  }, [searchParams, sendUserMessage, setSearchParams])

  return (
    <ChatView 
      messages={messages} 
      transcriptRef={transcriptRef} 
      sendUserMessage={sendUserMessage} 
      chatInput={chatInput} 
      setChatInput={setChatInput} 
      isSending={isSending}
    />
  )
}

function ChatView({ messages, transcriptRef, sendUserMessage, chatInput, setChatInput, isSending }: ChatProps) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="chat-transcript" ref={transcriptRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg-row ${m.role}`}>
            <div className="msg-avatar">{m.role === 'assistant' ? 'W' : 'U'}</div>
            <div className="msg-bubble">
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
              {m.payload?.kind === 'candidates' && (
                <div className="candidate-grid">
                  {m.payload.candidates.map((c) => (
                    <MatchCard key={c.name} candidate={c} onSelect={(name) => sendUserMessage(`SELECT_CANDIDATE: ${name}`)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isSending && <div className="msg-row assistant"><div className="msg-avatar">...</div></div>}
      </div>
      <div className="chat-composer">
        <form className="composer-pill" onSubmit={(e) => { e.preventDefault(); if(chatInput.trim()) { sendUserMessage(chatInput); setChatInput(''); } }}>
          <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Say something..." />
          <button type="submit">→</button>
        </form>
      </div>
    </div>
  )
}

export default App
