import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export default function WaitlistPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const query = searchParams.get('query') || '';

  useEffect(() => {
    const storedEmail = localStorage.getItem('luminous-email');
    if (storedEmail) {
      navigate(`/chat?query=${encodeURIComponent(query)}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.toLowerCase().trim(),
          query: query 
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to join waitlist');
      }

      setIsSuccess(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="waitlist-page">
      <div className="waitlist-card">
        {!isSuccess ? (
          <>
            <div className="waitlist-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h1 className="waitlist-title">Join the Waitlist</h1>
            <p className="waitlist-subtitle">
              Luminous is currently invite-only. Enter your email to get early access and be notified when we open up.
            </p>
            
            {query && (
              <div className="waitlist-query">
                You're searching for: <strong>{query}</strong>
              </div>
            )}
            
            <form className="waitlist-form" onSubmit={handleSubmit}>
              <input
                className="waitlist-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
              
              {error && <p className="auth-error">{error}</p>}
              
              <button 
                type="submit" 
                className="waitlist-submit"
                disabled={isLoading || !email.trim()}
              >
                {isLoading ? 'Joining...' : 'Join Waitlist'}
              </button>
            </form>

            <p style={{ marginTop: '24px', fontSize: '14px', color: 'var(--muted)' }}>
              Already have access?{' '}
              <button 
                onClick={() => navigate('/signin')} 
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--ink)', 
                  fontWeight: 600, 
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Sign In
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="waitlist-success-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 className="waitlist-success-title">You're on the list!</h2>
            <p className="waitlist-success-text">
              We'll notify you at <strong>{email}</strong> when access becomes available.
            </p>
            
            <a href="/" className="waitlist-back">
              ← Back to Home
            </a>
          </>
        )}
      </div>
    </div>
  );
}