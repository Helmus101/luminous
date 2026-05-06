import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const isAuthenticated = !!localStorage.getItem('luminous-email');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (isAuthenticated) {
      navigate(`/chat?query=${encodeURIComponent(query)}`);
    } else {
      navigate(`/waitlist?query=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <a href="/" className="landing-nav-logo">
          <div className="landing-nav-logo-icon"></div>
          <span className="landing-nav-logo-text">Luminous</span>
        </a>
        <div className="landing-nav-actions">
          {isAuthenticated ? (
            <button 
              className="landing-search-btn"
              onClick={() => navigate('/chat')}
            >
              Go to Chat
            </button>
          ) : (
            <button 
              className="landing-search-btn"
              onClick={() => navigate('/signin')}
            >
              Sign In
            </button>
          )}
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <span className="landing-hero-badge-dot"></span>
            Expert Mentor Matching
          </div>
          <h1 className="landing-hero-title">
            Find your next mentor in{' '}
            <span className="landing-hero-title-highlight">seconds</span>
          </h1>
          <p className="landing-hero-subtitle">
            A professional network built on high-context, double opt-in introductions. 
            Connect with mentors who understand your unique trajectory.
          </p>
          
          <form className="landing-hero-form" onSubmit={handleSubmit}>
            <div className="landing-search-wrapper">
              <input
                className="landing-search-input"
                type="text"
                placeholder="What are you looking for? (e.g., AI strategy mentor)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button 
                type="submit" 
                className="landing-search-btn"
                disabled={!query.trim()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                {isAuthenticated ? 'Search' : 'Join Waitlist'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="landing-explanation">
        <div className="landing-explanation-inner">
          <div className="landing-explanation-header">
            <p className="landing-explanation-label">How it works</p>
            <h2 className="landing-explanation-title">
              High-context matching for meaningful connections
            </h2>
          </div>

          <div className="landing-explanation-grid">
            <div className="landing-feature-card">
              <div className="landing-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h3 className="landing-feature-title">Semantic Search</h3>
              <p className="landing-feature-description">
                Describe what you're looking for in natural language. Our AI understands your goals, challenges, and trajectory to find the right mentors.
              </p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
              </div>
              <h3 className="landing-feature-title">Professional Network</h3>
              <p className="landing-feature-description">
                Access our curated network of 50+ mentors across hospitality, real estate, consulting, AI, education, and more. Each mentor is verified and willing to connect.
              </p>
            </div>

            <div className="landing-feature-card">
              <div className="landing-feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </div>
              <h3 className="landing-feature-title">Double Opt-In</h3>
              <p className="landing-feature-description">
                Your introduction is only made when both parties consent. This ensures meaningful connections and respects everyone's time.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-stats">
        <div className="landing-stats-inner">
          <div className="landing-stat">
            <div className="landing-stat-value">50+</div>
            <div className="landing-stat-label">Expert Mentors</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">7</div>
            <div className="landing-stat-label">Industries</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">3</div>
            <div className="landing-stat-label">Intros per Month</div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>Luminous Mentor Matching · Professional introductions that matter</p>
      </footer>
    </div>
  );
}