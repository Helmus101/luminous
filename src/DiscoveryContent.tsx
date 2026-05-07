import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

type University = {
  id: string
  name: string
  slug: string
  location: string
  vibe: string
  student_count: string
  acceptance_rate: string
  popular_majors: string[]
  housing: string
  
  // Academics
  gpa_range: string
  test_scores: string
  grad_rate: string
  retention_rate: string
  major_count: string
  double_major_ease: string
  class_size: string
  grading_culture: string
  
  // Campus Life
  housing_guarantee: string
  residential_culture: string
  party_scene: string
  dating_scene: string
  mental_health: string
  food_quality: string
  
  // Location
  setting: string
  transportation: string
  climate: string
  
  // Finances
  sticker_price: string
  avg_aid: string
  need_blind: boolean
  
  // Vibe & Real Talk
  personality: string
  stress_level: string // 1-10
  fomo_factor: string
  
  deep_dive: string
  student_quote: string
  misconception: string
}

const campusProfiles: University[] = [
  { 
    id: 'upenn', 
    name: 'University of Pennsylvania', 
    slug: 'upenn',
    location: 'Philadelphia, PA', 
    vibe: 'Competitive & Pre-professional',
    student_count: '10,000',
    acceptance_rate: '6%',
    popular_majors: ['Finance', 'Nursing', 'Philosophy'],
    housing: '100% Guaranteed',
    gpa_range: '3.9+',
    test_scores: '1510-1570 SAT',
    grad_rate: '96%',
    retention_rate: '98%',
    major_count: '90+',
    double_major_ease: 'Requires Approval',
    class_size: '20 (Seminar) / 200 (Intro)',
    grading_culture: 'Varies by Dept (Wharton Curved)',
    housing_guarantee: '4 Years',
    residential_culture: 'Socially tiered, Greek dominant',
    party_scene: 'Dominant social outlet (Frats/Bars)',
    dating_scene: 'High-pressure/Coupled',
    mental_health: 'Fast-paced, high academic pressure',
    food_quality: 'Decent (Multiple options)',
    setting: 'Urban (West Philly)',
    transportation: 'Walkable / SEPTA accessible',
    climate: 'Four Seasons',
    sticker_price: '$85,000',
    avg_aid: '$60,000',
    need_blind: true,
    personality: 'Hyper-ambitious, outcome-oriented, socially tiered.',
    stress_level: '9/10',
    fomo_factor: 'Severe',
    deep_dive: "The network at UPenn revolves around the 'Quaker' ethos—efficiency and outcome-oriented connections. Students are often balancing double-majors and early-stage ventures.",
    student_quote: "Nobody tells you about the 'Wharton Fog'—it's not just a major, it's a social gravity that affects everyone.",
    misconception: "That everyone is at Wharton. The College and Engineering have their own intense subcultures."
  },
  { 
    id: 'berkeley', 
    name: 'UC Berkeley', 
    slug: 'berkeley',
    location: 'Berkeley, CA', 
    vibe: 'Huge & Decentralized',
    student_count: '32,000',
    acceptance_rate: '11%',
    popular_majors: ['CS', 'Econ', 'Cell Biology'],
    housing: '60% (Limited)',
    gpa_range: '3.89-4.00',
    test_scores: 'N/A (Test Blind)',
    grad_rate: '92%',
    retention_rate: '97%',
    major_count: '150+',
    double_major_ease: 'Easy if in same college',
    class_size: '30 (Seminar) / 800 (CS61A)',
    grading_culture: 'Rigorous (Deflation in STEM)',
    housing_guarantee: '1 Year (Usually)',
    residential_culture: 'Scattered, vibrant, politically active',
    party_scene: 'Co-ops & Frats; very decentralised',
    dating_scene: 'Casual/Fluid',
    mental_health: 'Navigating bureaucracy is a stressor',
    food_quality: 'Gourmet Ghetto nearby is amazing',
    setting: 'Urban / Hills',
    transportation: 'BART / Extremely walkable',
    climate: 'Mild / Constant spring',
    sticker_price: '$45,000 (In-state)',
    avg_aid: '$25,000',
    need_blind: true,
    personality: 'Intellectually fierce, radical, DIY-ethos.',
    stress_level: '8.5/10',
    fomo_factor: 'Moderate',
    deep_dive: "Berkeley doesn't hold your hand. You have to fight for resources, but finding your 'tribe' in a 30,000-person sea is part of the growth process.",
    student_quote: "If you want a safe bubble, don't come here. If you want to see the world as it's becoming, apply.",
    misconception: "That it's all protests. Most people are just in the library trying to survive EECS."
  },
  { 
    id: 'stanford', 
    name: 'Stanford University', 
    slug: 'stanford',
    location: 'Stanford, CA', 
    vibe: 'Founder-led & Sunny',
    student_count: '7,700',
    acceptance_rate: '4%',
    popular_majors: ['CS', 'Engineering', 'Human Bio'],
    housing: '99% Guaranteed',
    gpa_range: '3.95+',
    test_scores: '1500-1570 SAT',
    grad_rate: '95%',
    retention_rate: '98%',
    major_count: '65+',
    double_major_ease: 'Very flexible',
    class_size: '15 (Small classes) / 300 (Intro)',
    grading_culture: 'Supportive (Grade inflation)',
    housing_guarantee: '4 Years',
    residential_culture: 'Theme-house centric',
    party_scene: 'Low-key/Dorm-based; restricted Greek life',
    dating_scene: 'Socially awkward/Pre-professional',
    mental_health: 'Duck Syndrome is the primary theme',
    food_quality: 'Varied (High residential quality)',
    setting: 'Suburban (The Farm)',
    transportation: 'Bikes required / Caltrain nearby',
    climate: 'Sunny / California Coastal',
    sticker_price: '$82,000',
    avg_aid: '$65,000',
    need_blind: true,
    personality: 'Founding-culture, elite access, high-pressure chill.',
    stress_level: '7.5/10 (Duck Syndrome)',
    fomo_factor: 'High',
    deep_dive: "Stanford mentorship is the ultimate gateway to Sand Hill Road. The 'Stanford Social Graph' is uniquely optimized for early-stage funding.",
    student_quote: "It's called the 'Duck Syndrome'—everyone looks calm on the surface but they're paddling like hell underneath.",
    misconception: "That everyone is a tech bro. The arts and humanities scene is surprisingly robust."
  },
]

export default function DiscoveryContent() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'vibe' | 'social' | 'wellbeing' | 'academics' | 'practical' | 'fit'>('vibe')
  
  const selectedUni = slug ? campusProfiles.find(u => u.slug === slug) : null

  const profileTabs: { id: typeof activeTab; label: string }[] = [
    { id: 'vibe', label: 'Vibe' },
    { id: 'social', label: 'Social' },
    { id: 'wellbeing', label: 'Wellbeing' },
    { id: 'academics', label: 'Academics' },
    { id: 'practical', label: 'Practical' },
    { id: 'fit', label: 'Fit' },
  ]

  const filtered = campusProfiles.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.location.toLowerCase().includes(search.toLowerCase()) ||
    u.vibe.toLowerCase().includes(search.toLowerCase())
  )

  if (selectedUni) {
    return (
      <main className="discovery-view" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
        <button 
          onClick={() => navigate('/discovery')}
          style={{ background: 'transparent', border: 'none', color: '#64748b', fontWeight: 600, cursor: 'pointer', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          ← Back to Discovery
        </button>
        
        <div style={{ marginBottom: '40px' }}>
          <p className="pulse-kicker" style={{ color: '#64748b', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>{selectedUni.location} • {selectedUni.setting}</p>
          <h1 style={{ fontSize: '3.5rem', marginBottom: '12px', letterSpacing: '-2px' }}>{selectedUni.name}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ background: '#0f172a', color: 'white', padding: '6px 14px', borderRadius: '100px', fontSize: '13px', fontWeight: 600 }}>{selectedUni.vibe}</span>
            <span style={{ border: '1px solid #e2e8f0', color: '#64748b', padding: '6px 14px', borderRadius: '100px', fontSize: '13px', fontWeight: 600 }}>{selectedUni.student_count} Undergrads</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid #e2e8f0', marginBottom: '40px' }}>
          {profileTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: '12px 0',
                fontSize: '15px',
                fontWeight: 700,
                color: activeTab === tab.id ? '#0f172a' : '#94a3b8',
                borderBottom: activeTab === tab.id ? '2px solid #0f172a' : '2px solid transparent',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ minHeight: '400px' }}>
          {activeTab === 'vibe' && (
            <div style={{ animation: 'slideUp 0.4s ease-out' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '40px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                  <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ marginTop: 0, fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student-Voice Snapshot</h3>
                    <p style={{ fontSize: '1.2rem', lineHeight: 1.6, color: '#1e293b', margin: '16px 0' }}>{selectedUni.personality}</p>
                    <p style={{ fontStyle: 'italic', color: '#64748b', borderLeft: '4px solid #e2e8f0', paddingLeft: '20px', margin: '24px 0' }}>
                      "{selectedUni.student_quote}"
                    </p>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '14px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px' }}>The Biggest Misconception</h3>
                    <p style={{ color: '#475569', lineHeight: 1.6 }}>{selectedUni.misconception}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                   <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '20px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Academic Stress</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                        <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                          <div style={{ width: (parseInt(selectedUni.stress_level) * 10) + '%', height: '100%', background: '#ef4444', borderRadius: '4px' }}></div>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>{selectedUni.stress_level}</span>
                      </div>
                   </div>
                   <div style={{ background: '#1e293b', color: 'white', padding: '24px', borderRadius: '24px' }}>
                      <h4 style={{ margin: '0 0 12px 0' }}>Request Intro</h4>
                      <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Connect with a student at {selectedUni.name} to get the real story.</p>
                      <button 
                        onClick={() => navigate(`/chat?q=I want to talk to someone at ${selectedUni.name}`)}
                        style={{ width: '100%', background: '#3b82f6', border: 'none', color: 'white', padding: '12px', borderRadius: '12px', marginTop: '16px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Talk to Guide
                      </button>
                   </div>
                </div>
              </div>
            </div>
          )}
          {/* Add other tab contents as needed */}
          {activeTab !== 'vibe' && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '24px', border: '1px dashed #e2e8f0' }}>
              Full {activeTab} analysis for {selectedUni.name} is coming soon in the next beta update.
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <div className="discovery-container" style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '60px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', letterSpacing: '-2px', marginBottom: '16px' }}>Campus Intelligence</h1>
        <p style={{ color: '#64748b', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto 32px' }}>
          Unfiltered student-voice data on elite campuses. Find where you actually belong.
        </p>
        <div style={{ position: 'relative', maxWidth: '500px', margin: '0 auto' }}>
          <input 
            className="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by school, vibe, or location..."
            style={{ width: '100%', padding: '16px 24px', borderRadius: '100px', border: '1px solid #e2e8f0', fontSize: '16px', outline: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
          />
        </div>
      </div>

      <div className="discovery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
        {filtered.map(uni => (
          <div key={uni.id} className="discovery-card" onClick={() => navigate('/discovery/' + uni.slug)} style={{ cursor: 'pointer', background: 'white', border: '1px solid #e2e8f0', borderRadius: '24px', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s' }}>
            <div style={{ padding: '32px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{uni.location}</p>
              <h3 style={{ margin: '8px 0 16px', fontSize: '1.6rem', letterSpacing: '-0.5px' }}>{uni.name}</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                 <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, color: '#475569' }}>{uni.vibe}</span>
                 <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '4px', fontWeight: 700, color: '#475569' }}>{uni.acceptance_rate} Admit</span>
              </div>
              <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
                {uni.personality.slice(0, 100)}...
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '24px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>View Profile</span>
                <span style={{ color: '#cbd5e1' }}>→</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
