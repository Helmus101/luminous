import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { FormEvent, KeyboardEvent } from 'react';

type Role = 'user' | 'assistant';

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

type ChatMessage = {
  id: string
  role: Role
  content: string
  payload?: AssistantPayload
}

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi, I'm Luminous. Before we start, what should I call you?",
};

export default function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const emailRef = useRef<string>('');
  const messagesRef = useRef<ChatMessage[]>(messages);
  const initializedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadChatHistory = useCallback(async (userEmail: string) => {
    try {
      const resp = await fetch(`/api/chat/latest?email=${encodeURIComponent(userEmail)}`);
      if (resp.ok) {
        const data = await resp.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages.map((m: ChatMessage, i: number) => ({...m, id: m.id || `h-${i}`})));
        }
      }
    } catch (err) {
      console.error('Failed to load history', err);
    }
  }, []);

  const sendInitialMessage = useCallback(async (email: string, query: string) => {
    setIsSending(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          email: email,
        }),
      });
      const data = await response.json();
      
      if (data.payload?.kind === 'reset') {
        localStorage.removeItem('luminous-email');
        window.location.reload();
        return;
      }

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: data.text,
        payload: data.payload 
      }]);
    } catch {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: "Sorry, I encountered an error. Please try again." 
      }]);
    } finally {
      setIsSending(false);
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const storedEmail = localStorage.getItem('luminous-email');
    if (!storedEmail) {
      const query = searchParams.get('query') || '';
      navigate(`/signin?redirect=/chat&query=${encodeURIComponent(query)}`, { replace: true });
      return;
    }
    
    emailRef.current = storedEmail;
    
    const query = searchParams.get('query');
    if (query) {
      loadChatHistory(storedEmail).then(() => {
        sendInitialMessage(storedEmail, query);
      });
    } else {
      loadChatHistory(storedEmail);
    }
  }, [loadChatHistory, sendInitialMessage, navigate, searchParams]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const sendUserMessage = useCallback(async (text: string) => {
    if (!text.startsWith('Analyzed LinkedIn:')) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }]);
    }
    setIsSending(true);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messagesRef.current, { id: crypto.randomUUID(), role: 'user', content: text }].filter(m => typeof m.id === 'string' && !m.id.startsWith('h-')),
          email: emailRef.current,
        }),
      });
      const data = await response.json();
      
      if (data.payload?.kind === 'reset') {
        localStorage.removeItem('luminous-email');
        window.location.reload();
        return;
      }

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: data.text,
        payload: data.payload 
      }]);
    } catch {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: "Sorry, I encountered an error. Please try again." 
      }]);
    } finally {
      setIsSending(false);
    }
  }, []);

  const handleChatSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isSending) return;
    
    if (text === 'deleteall--00') {
      await sendUserMessage(text);
      localStorage.removeItem('luminous-email');
      window.location.reload();
      return;
    }

    if (text.toLowerCase().includes('linkedin.com/')) {
      const userMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text }]);
      setIsSending(true);
      
      try {
        await fetch('/api/linkedin-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ linkedinUrl: text, email: emailRef.current })
        });
        await sendUserMessage(`Analyzed LinkedIn: ${text}`);
      } catch {
        await sendUserMessage(text);
      } finally {
        setIsSending(false);
      }
    } else {
      await sendUserMessage(text);
    }
    setChatInput('');
  }, [chatInput, isSending, sendUserMessage]);

  const handleSelectCandidate = useCallback(async (candidateId: string, candidateName: string) => {
    setIsSending(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messagesRef.current, { role: 'user', content: `Select ${candidateName}` }],
          email: emailRef.current,
        }),
      });
      const data = await response.json();

      if (response.status === 429) {
        setMessages(prev => [...prev, { 
          id: crypto.randomUUID(), 
          role: 'user', 
          content: `Select ${candidateName}` 
        }, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.text
        }]);
        return;
      }

      await fetch('/api/intros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailRef.current, candidateId })
      });

      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'user', 
        content: `Select ${candidateName}` 
      }, {
        id: crypto.randomUUID(), 
        role: 'assistant', 
        content: `Excellent choice. I've initiated the double opt-in process with ${candidateName}. I'll notify you once they accept.` 
      }]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  }, []);

  return (
    <div className="chat-view">
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-logo"></div>
          <span style={{fontWeight: 600}}>Luminous AI</span>
        </div>
        <div className="quota-badge">
          <div className="quota-dot"></div>
          Introductions
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
                    <div className="upload-options">
                      <button className="upload-btn primary" onClick={() => sendUserMessage("I'll paste my career history")}>
                        Paste Context
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
                    e.preventDefault();
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
  );
}