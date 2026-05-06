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
      candidates?: { id: string; name: string; reason: string; linkedinUrl: string }[]
      requestId?: string
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
  content: "Hi, I'm Luminous. Before we start, what should I call you (your name)?",
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase())
}

function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [heroQuery, setHeroQuery] = useState('')
  const [email, setEmail] = useState(() => localStorage.getItem('luminous-email') || '')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [authError, setAuthError] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const storedEmail = localStorage.getItem('luminous-email')
    if (storedEmail) {
      setEmail(storedEmail)
      setScreen('chat')
      fetchLatestChat(storedEmail)
    }
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending])

  const fetchLatestChat = async (userEmail: string) => {
    try {
      const resp = await fetch(`/api/chat/latest?email=${encodeURIComponent(userEmail)}`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
        }
      }
    } catch (err) {
      console.error('Failed to load history', err)
    }
  }

  const handleHeroSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!heroQuery.trim()) return
    setScreen('auth')
  }

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValidEmail(email)) {
      setAuthError('Valid email please.')
      return
    }
    localStorage.setItem('luminous-email', email)
    setScreen('chat')
    if (heroQuery) {
       sendUserMessage(heroQuery)
    } else {
       fetchLatestChat(email)
    }
  }

  const handleChatSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || isSending) return
    
    if (text.toLowerCase().includes('linkedin.com/in/')) {
      await handleLinkedinInput(text)
    } else {
      await sendUserMessage(text)
    }
    setChatInput('')
  }

  const handleLinkedinInput = async (text: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
    setIsSending(true)
    
    setMessages(prev => [...prev, { 
      id: crypto.randomUUID(), 
      role: 'assistant', 
      content: "Analyzing your professional background from LinkedIn..." 
    }])

    try {
      const resp = await fetch('/api/linkedin-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: text, email })
      })
      const data = await resp.json()
      
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: `I've successfully updated your profile. I see deep experience in ${data.profile.skills?.join(', ')}. What are you looking for in a mentor?`
      }])
    } catch (err) {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: "I couldn't extract info from that link, but let's continue! What are you looking for?" 
      }])
    } finally {
      setIsSending(false)
    }
  }

  const sendUserMessage = async (text: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
    setIsSending(true)
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: text }],
          email: email,
        }),
      })
      const data = await response.json()
      
      if (response.status === 429) {
          setMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'assistant', 
            content: data.text 
          }])
          return
      }

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: data.text,
        payload: data.payload 
      }])
    } catch (err) {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: "Sorry, I encountered an error. Please try again." 
      }])
    } finally {
      setIsSending(false)
    }
  }

  const handleSelectCandidate = async (candidateId: string, candidateName: string) => {
    setIsSending(true)
    // 1. Send the 'Select' message to trigger the backend quota check
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        return;
      }

      // 2. Record the intro in the DB
      await fetch('/api/intros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, candidateId })
      });

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'user', 
        content: `Select ${candidateName}` 
      }, {
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: `Great choice! I've initiated outreach to ${candidateName}. I'll update you as soon as they respond.` 
      }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  }

  if (screen === 'landing') {
    return (
      <div className="app-shell">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="content-container">
          <h1 className="title">Find Your Mentor</h1>
          <h2 className="subtitle">in seconds</h2>
          <form className="hero-search-container" onSubmit={handleHeroSubmit}>
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              placeholder="e.g., startup founder, climate tech"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
            />
            <button type="submit" className="hero-submit-btn" disabled={!heroQuery.trim()}>
              →
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (screen === 'auth') {
    return (
      <div className="app-shell">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="auth-panel">
          <h2>{authMode === 'signin' ? 'Welcome Back' : 'Create Account'}</h2>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {authError && <p style={{ color: 'red', fontSize: '12px' }}>{authError}</p>}
            <button type="submit" className="auth-submit">
              {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          </form>
          <button className="auth-toggle" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>
            {authMode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-page">
      <div className="chat-transcript" ref={transcriptRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg-row ${m.role}`}>
            <div className="msg-avatar">{m.role === 'assistant' ? 'L' : 'U'}</div>
            <div className="msg-bubble">
              {m.content}
              
              {m.payload?.kind === 'upload_request' && (
                <div className="conn-card">
                  <h3 style={{fontFamily: 'var(--title-font)'}}>{m.payload.infoTitle}</h3>
                  <p style={{fontSize: '14px', marginBottom: '20px'}}>{m.payload.infoBody}</p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="cand-btn" onClick={() => sendUserMessage("I'll provide an AI prompt summary")}>
                      Use Prompt
                    </button>
                    <button className="cand-btn" style={{ background: '#f1f5f9', color: '#0f172a' }} onClick={() => sendUserMessage("I'll upload full history")}>
                      Upload History
                    </button>
                  </div>
                </div>
              )}

              {m.payload?.kind === 'connection_started' && (
                <div className="conn-card">
                  <h3 style={{ margin: '0 0 10px 0', fontFamily: 'var(--title-font)' }}>{m.payload.title}</h3>
                  <p style={{ fontSize: '14px', color: '#64748b' }}>{m.payload.text}</p>
                  
                  {m.payload.candidates && (
                    <div style={{ marginTop: '24px' }}>
                      {m.payload.candidates.map((can, idx) => (
                        <div key={idx} className="cand-item">
                          <div style={{ fontWeight: 600 }}>{can.name}</div>
                          <div style={{ fontSize: '14px', margin: '4px 0 12px' }}>{can.reason}</div>
                          <a href={can.linkedinUrl} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', display: 'block', marginBottom: '12px' }}>LinkedIn Profile</a>
                          <button className="cand-btn" onClick={() => handleSelectCandidate(can.id, can.name)}>
                            Select {can.name}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="msg-row assistant">
            <div className="msg-avatar">L</div>
            <div className="msg-bubble">Thinking...</div>
          </div>
        )}
      </div>

      <div className="chat-composer">
        <form className="composer-pill" onSubmit={handleChatSubmit}>
          <input 
            type="text" 
            placeholder="Type your message..." 
            value={chatInput} 
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button type="submit">↑</button>
        </form>
      </div>
    </div>
  )
}

export default App
