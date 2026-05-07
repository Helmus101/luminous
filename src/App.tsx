import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import DiscoveryContent from './DiscoveryContent'

type Role = 'user' | 'assistant'
type Screen = 'landing' | 'auth' | 'chat' | 'discovery'

type AssistantPayload =
  | { kind: 'text'; text: string }
  | { kind: 'upload_request'; infoTitle: string; infoBody: string }
  | {
      kind: 'connection_started'
      title: string
      text: string
      candidates?: { name: string; reason: string; linkedinUrl: string }[]
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
  content: "Welcome to Luminous. I build student-voice campus intelligence and connect people when it is useful. Before we begin, what should I call you?",
}

function App() {
  const [screen, setScreen] = useState<Screen>('landing')
  const [heroQuery, setHeroQuery] = useState('')
  const [email, setEmail] = useState(() => localStorage.getItem('luminous-email') || '')
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const unis = [
    { name: 'Stanford', logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4b/Stanford_Cardinal_logo.svg' },
    { name: 'Berkeley', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Seal_of_University_of_California%2C_Berkeley.svg' },
    { name: 'Cambridge', logo: '/cambridge.svg' }
  ]

  const fetchLatestChat = async (userEmail: string) => {
    try {
      const resp = await fetch(`/api/chat/latest?email=${encodeURIComponent(userEmail)}`)
      if (resp.ok) {
        const data = await resp.json()
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages)
          setScreen('chat')
        }
      }
    } catch (err) {
      console.error('History load failed', err)
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem('luminous-email')
    if (stored) {
      const timer = window.setTimeout(() => {
        setEmail(stored)
        fetchLatestChat(stored)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isSending])

  const handleHeroSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!heroQuery.trim()) return
    setScreen('auth')
  }

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault()
    if (!email) return
    localStorage.setItem('luminous-email', email)
    await fetch('/api/users/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null)
    setScreen('chat')
    setHeroQuery('')
    fetchLatestChat(email)
  }

  const sendUserMessage = async (text: string) => {
    const newMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, newMsg])
    setIsSending(true)
    
    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, newMsg], email })
      })
      const data = await resp.json()
      
      // Handle system commands like clear_chat
      if (data.payload?.action === 'clear_chat') {
        setMessages([welcomeMessage]);
      } else {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.text, payload: data.payload }])
      }
    } catch (err) {
      console.error('Chat error', err)
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: "I encountered an error. Please try again." }])
    } finally {
      setIsSending(false)
    }
  }

  // LANDING
  if (screen === 'landing') {
    return (
      <div className="app-shell">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="content-container">
          <h1 className="title">Understand campus</h1>
          <h2 className="subtitle">through real students</h2>
          <p className="description-text">Luminous turns student conversations into honest university discovery pages, then helps with warm intros when a real person would be useful.</p>
          <form className="hero-search-container" onSubmit={handleHeroSubmit}>
            <input 
              type="text" 
              placeholder="e.g., startup founder, climate tech, luxury real estate"
              value={heroQuery}
              onChange={(e) => setHeroQuery(e.target.value)}
            />
            <button type="submit" className="hero-submit-btn">→</button>
          </form>
          <button className="landing-signin-btn" onClick={() => setScreen('auth')}>
            Sign In
          </button>

          <div className="landing-product-grid">
            <article>
              <span>01</span>
              <h3>Discovery from students</h3>
              <p>Current students talk to Luminous about the real campus experience: stress, weekends, belonging, food, housing, classes, and what tours hide.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Profiles that feel human</h3>
              <p>University pages are built from student voice first, then organized into scannable sections for high school students deciding where they might thrive.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Warm intros when useful</h3>
              <p>When a student needs a person, Luminous uses their profile context to find a relevant mentor or student scout and starts a consent-based intro flow.</p>
            </article>
          </div>

          <div className="trusted-by">
            <span className="trusted-text">Trusted by students at:</span>
            <div className="uni-logos">
              {unis.map(uni => (
                <div key={uni.name} className="uni-item">
                  <img src={uni.logo} alt={uni.name} title={uni.name} />
                  <span>{uni.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // AUTH
  if (screen === 'auth') {
    return (
      <div className="app-shell">
        <div className="circle circle-1"></div>
        <div className="circle circle-2"></div>
        <div className="auth-panel">
          <h2 style={{ marginBottom: '24px', textAlign: 'center', letterSpacing: '-1px' }}>Luminous</h2>
          <form className="auth-form" onSubmit={handleAuth}>
            <input 
              type="email" 
              placeholder="Work Email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required
            />
            <button type="submit" className="auth-submit">Continue</button>
          </form>
          <button 
            onClick={() => setScreen('landing')} 
            style={{ width: '100%', marginTop: '12px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
          >
            ← Back
          </button>
        </div>
      </div>
    )
  }

  // CHAT / DISCOVERY
  return (
    <div className="chat-page">
      <header className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ fontWeight: 800, fontSize: '20px', letterSpacing: '-1.5px', color: '#0f172a' }}>Luminous</div>
        <nav className="tabs-nav">
          <button className={`tab-btn ${screen === 'chat' ? 'active' : ''}`} onClick={() => setScreen('chat')}>Chat</button>
          <button className={`tab-btn ${screen === 'discovery' ? 'active' : ''}`} onClick={() => setScreen('discovery')}>Discovery</button>
        </nav>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px' }}>Logout</button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {screen === 'discovery' ? (
          <DiscoveryContent />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="chat-transcript" ref={transcriptRef}>
              {messages.map(m => (
                <div key={m.id} className={`msg-row ${m.role}`}>
                  <div className="msg-avatar">{m.role === 'assistant' ? 'L' : 'U'}</div>
                  <div className="msg-bubble">{m.content}</div>
                </div>
              ))}
              {isSending && <div className="msg-row assistant"><div className="msg-avatar">L</div><div className="msg-bubble">Thinking...</div></div>}
            </div>
            <div className="chat-composer">
              <form className="composer-pill" onSubmit={(e) => { e.preventDefault(); if(chatInput.trim()) { sendUserMessage(chatInput); setChatInput(''); } }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." />
                <button type="submit">↑</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
