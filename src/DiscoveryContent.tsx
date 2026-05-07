import { useState } from 'react'

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
    test_scores: '1410-1550 SAT',
    grad_rate: '92%',
    retention_rate: '97%',
    major_count: '150+',
    double_major_ease: 'Easy',
    class_size: '30 / 500+',
    grading_culture: 'Harsh (STEM deflation)',
    housing_guarantee: '1 Year',
    residential_culture: 'Decentralized, Co-op culture strong',
    party_scene: 'Active, but focused in specific groups/frats',
    dating_scene: 'Apps/Niche groups',
    mental_health: 'Struggle for visibility in huge population',
    food_quality: 'Excellent (Off-campus options)',
    setting: 'Urban/Suburban mix',
    transportation: 'BART / Bus / Very walkable',
    climate: 'Mediterranean (Mild)',
    sticker_price: '$45,000 (In-state) / $75,000 (Out)',
    avg_aid: '$20,000',
    need_blind: false,
    personality: 'Engineering-first, activist roots, intellectual chaos.',
    stress_level: '8/10',
    fomo_factor: 'Moderate (Too big to care about everything)',
    deep_dive: "Berkeley logic is built on technical excellence. Mentors here are often 'Foundry' alumni with deep roots in AI Labs and robotics.",
    student_quote: "You have to fight for your spot here, but once you find your lab or your club, you have a second family.",
    misconception: "That it's just a 'hippy' school. It's one of the most rigorous technical environments globally."
  },
  { 
    id: 'stanford', 
    name: 'Stanford University', 
    slug: 'stanford',
    location: 'Stanford, CA', 
    vibe: 'Collaborative & Innovation-led',
    student_count: '7,800',
    acceptance_rate: '4%',
    popular_majors: ['CS', 'Human Bio', 'Engineering'],
    housing: '100%',
    gpa_range: '3.95+',
    test_scores: '1500-1580 SAT',
    grad_rate: '95%',
    retention_rate: '98%',
    major_count: '70+',
    double_major_ease: 'Very Easy',
    class_size: '12 / 150',
    grading_culture: 'Moderate (Some inflation)',
    housing_guarantee: '4 Years',
    residential_culture: 'Tight-knit, Neighborhood system',
    party_scene: 'One of many social outlets (Club focused)',
    dating_scene: 'Stanford Marriage Myth',
    mental_health: 'Duck Syndrome is prevalent',
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

function DiscoveryContent() {
  const [search, setSearch] = useState('')
  const [selectedUni, setSelectedUni] = useState<University | null>(null)
  const [activeTab, setActiveTab] = useState<'vibe' | 'social' | 'wellbeing' | 'academics' | 'practical' | 'fit'>('vibe')
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
      <main className="discovery-view" style={{ maxWidth: '1000px' }}>
        <button 
          onClick={() => setSelectedUni(null)}
          style={{ background: 'transparent', border: 'none', color: '#64748b', fontWeight: 600, cursor: 'pointer', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          ← Back to Discovery
        </button>
        
        {/* HEADER SNAPSHOT */}
        <div style={{ marginBottom: '40px' }}>
          <p className="pulse-kicker">{selectedUni.location} • {selectedUni.setting}</p>
          <h1 style={{ fontSize: '3.5rem', marginBottom: '12px', letterSpacing: '-2px' }}>{selectedUni.name}</h1>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ background: '#0f172a', color: 'white', padding: '6px 14px', borderRadius: '100px', fontSize: '13px', fontWeight: 600 }}>{selectedUni.vibe}</span>
            <span style={{ border: '1px solid #e2e8f0', color: '#64748b', padding: '6px 14px', borderRadius: '100px', fontSize: '13px', fontWeight: 600 }}>{selectedUni.student_count} Undergrads</span>
          </div>
        </div>

        {/* STUDENT-VOICE NAVIGATION */}
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
                          <div style={{ width: `${(parseInt(selectedUni.stress_level)/10)*100}%`, height: '100%', background: '#0f172a', borderRadius: '4px' }}></div>
                        </div>
                        <span style={{ fontWeight: 800, fontSize: '18px' }}>{selectedUni.stress_level}</span>
                      </div>
                   </div>
                   <div style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '20px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>Top Target Majors</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                        {selectedUni.popular_majors.map(m => (
                          <span key={m} style={{ background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700 }}>{m}</span>
                        ))}
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'social' && (
            <div style={{ animation: 'slideUp 0.4s ease-out', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 20px', color: '#0f172a' }}>Weekend Reality</h4>
                <p style={{ color: '#475569', lineHeight: 1.7 }}>{selectedUni.party_scene}</p>
                <p style={{ color: '#64748b', lineHeight: 1.7 }}>The useful question here is not “is it fun?” It is where friendships actually form, whether FOMO is real, and whether you need the dominant social scene to feel connected.</p>
              </div>
              <div style={{ display: 'grid', gap: '20px' }}>
                {[
                  ['Friend Formation', selectedUni.residential_culture],
                  ['Dating & Romance', selectedUni.dating_scene],
                  ['FOMO Factor', selectedUni.fomo_factor],
                ].map(([label, value]) => (
                  <div key={label} style={{ border: '1px solid #e2e8f0', padding: '24px', borderRadius: '20px', background: 'white' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
                    <p style={{ margin: '8px 0 0', fontWeight: 700, color: '#0f172a' }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'wellbeing' && (
            <div style={{ animation: 'slideUp 0.4s ease-out', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div style={{ background: '#0f172a', color: 'white', padding: '36px', borderRadius: '28px' }}>
                <span style={{ fontSize: '12px', opacity: 0.65, fontWeight: 800, textTransform: 'uppercase' }}>Thriving vs. Surviving</span>
                <h2 style={{ fontSize: '3rem', margin: '12px 0' }}>{selectedUni.stress_level}</h2>
                <p style={{ color: '#cbd5e1', lineHeight: 1.7 }}>{selectedUni.mental_health}</p>
              </div>
              <div style={{ border: '1px solid #e2e8f0', padding: '32px', borderRadius: '24px', background: 'white' }}>
                <h4 style={{ marginTop: 0 }}>Questions Luminous asks students</h4>
                <ul style={{ color: '#475569', lineHeight: 1.8, paddingLeft: '20px' }}>
                  <li>What stresses people out most?</li>
                  <li>Do people struggle openly or hide it?</li>
                  <li>If someone is having a bad week, where do they actually go?</li>
                  <li>Would you describe people as thriving, surviving, or performing calm?</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'academics' && (
            <div style={{ animation: 'slideUp 0.4s ease-out', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
              {[
                { label: 'GPA Middle 50%', val: selectedUni.gpa_range },
                { label: 'SAT/ACT Middle 50%', val: selectedUni.test_scores },
                { label: 'Graduation Rate', val: selectedUni.grad_rate },
                { label: 'Retention Rate', val: selectedUni.retention_rate },
                { label: '# of Majors', val: selectedUni.major_count },
                { label: 'Course Flexibility', val: selectedUni.double_major_ease },
                { label: 'Avg Class Size', val: selectedUni.class_size },
                { label: 'Grading Culture', val: selectedUni.grading_culture }
              ].map(stat => (
                <div key={stat.label} style={{ background: 'white', border: '1px solid #e2e8f0', padding: '24px', borderRadius: '20px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{stat.label}</span>
                  <p style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '8px 0 0' }}>{stat.val}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'practical' && (
            <div style={{ animation: 'slideUp 0.4s ease-out', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
              {[
                ['Housing', `${selectedUni.residential_culture}. Guarantee: ${selectedUni.housing_guarantee}`],
                ['Food', selectedUni.food_quality],
                ['Setting', `${selectedUni.setting}. ${selectedUni.transportation}`],
                ['Climate', selectedUni.climate],
              ].map(([label, value]) => (
                <div key={label} style={{ border: '1px solid #e2e8f0', padding: '24px', borderRadius: '20px', background: 'white' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
                  <p style={{ margin: '10px 0 0', color: '#475569', lineHeight: 1.6, fontWeight: 650 }}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'fit' && (
            <div style={{ animation: 'slideUp 0.4s ease-out', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '32px', borderRadius: '24px' }}>
                <h4 style={{ marginTop: 0 }}>Who tends to thrive</h4>
                <p style={{ color: '#475569', lineHeight: 1.7 }}>{selectedUni.deep_dive}</p>
              </div>
              <div style={{ border: '1px solid #e2e8f0', padding: '32px', borderRadius: '24px', background: 'white' }}>
                <h4 style={{ marginTop: 0 }}>Reality check</h4>
                <p style={{ color: '#475569', lineHeight: 1.7 }}>{selectedUni.misconception}</p>
                <p style={{ color: '#64748b', lineHeight: 1.7 }}>Luminous improves this section by asking current students who would love the school, who would struggle, and whether they would choose it again.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="discovery-view">
      <section className="discovery-hero">
        <p className="pulse-kicker">Discovery</p>
        <h1>Find Your People.</h1>
        <p>
          Real student experiences, unfiltered vibes, and verified campus signals. 
          No marketing fluff, just the truth about where you'll thrive.
        </p>
        <div className="discovery-search-pill">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vibe, major, or campus name..."
          />
        </div>
      </section>

      <div className="pulse-feed">
        {filtered.map(uni => (
          <article 
            key={uni.id} 
            className="pulse-card"
            onClick={() => setSelectedUni(uni)}
          >
            <div className="pulse-kicker">{uni.location}</div>
            <h2>{uni.name}</h2>
            <div className="pulse-body" style={{ fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>
              {uni.vibe}
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '24px' }}>
              {uni.popular_majors.map(tag => (
                <span key={tag} style={{ fontSize: '10px', padding: '4px 8px', background: '#f1f5f9', borderRadius: '4px', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                  {tag}
                </span>
              ))}
            </div>

            <div className="pulse-stats">
              <div className="stat-item">
                <span className="stat-val">{uni.acceptance_rate}</span>
                <span className="stat-lbl">Admit Rate</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{uni.stress_level}/10</span>
                <span className="stat-lbl">Stress Vibe</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  )
}

export default DiscoveryContent
