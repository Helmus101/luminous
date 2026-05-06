import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export default function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const redirect = searchParams.get('redirect') || '/chat';
  const query = searchParams.get('query') || '';

  const buildRedirectUrl = () => {
    let url = redirect;
    if (query) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}query=${encodeURIComponent(query)}`;
    }
    return url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      localStorage.setItem('luminous-email', email.toLowerCase().trim());
      navigate(buildRedirectUrl(), { replace: true });
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-view">
      <div className="auth-card">
        <button className="auth-back" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
        <h2 className="auth-header">Welcome Back</h2>
        <p className="auth-subtext">Sign in to continue your mentor search.</p>
        
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <input 
              className="auth-input" 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required 
            />
          </div>
          
          {error && <p className="auth-error">{error}</p>}
          
          <button 
            type="submit" 
            className="auth-submit"
            disabled={isLoading || !email.trim()}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}