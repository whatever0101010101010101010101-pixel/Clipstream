import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const PLATFORM_NAMES = ['TikTok', 'Instagram', 'YouTube', 'Facebook', 'X', 'Threads', 'Snapchat', 'LinkedIn'];

const FEATURES = [
  {
    icon: '🎬',
    title: 'AI video analysis',
    text: 'Every upload is measured with ffmpeg: hook timing, loudness, pacing, shot changes, caption presence, length and more — then explained in plain language.',
  },
  {
    icon: '⚡',
    title: 'Viral potential score',
    text: 'A 0–100 estimate broken into hook, editing, audio, engagement and retention scores, with an honest disclaimer on every report.',
  },
  {
    icon: '🛠️',
    title: 'Improve my video',
    text: 'Rewrite the opening hook, get titles, captions, hashtags, editing notes, thumbnail concepts and best posting windows in one click.',
  },
  {
    icon: '📊',
    title: 'Creator dashboard',
    text: 'Views, followers, likes, comments, shares and engagement rate across every platform, with growth charts and platform comparisons.',
  },
  {
    icon: '🔍',
    title: 'Competitor analysis',
    text: 'Compare public content strategy, formats, posting frequency and engagement against creators in your niche. Private data is never exposed.',
  },
  {
    icon: '🧠',
    title: 'AI content assistant',
    text: 'Generate ideas, scripts, hooks, captions, hashtags and full content calendars tuned to your own performance history.',
  },
];

const DIMENSIONS = [
  'First 3-second hook', 'Video quality', 'Audio quality', 'Editing & transitions', 'Captions', 'Video length',
  'Pacing', 'Storytelling', 'Engagement potential', 'Audience retention', 'Thumbnail quality', 'Originality',
];

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    tagline: 'Test the analysis engine',
    features: ['5 video analyses / month', 'Basic analytics', 'Viral score + core findings', '1 connected account'],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    tagline: 'For creators posting weekly',
    features: ['60 analyses / month', 'Advanced analytics & charts', 'Full AI content assistant', 'Improvement studio + exports', '5 connected accounts'],
    cta: 'Start with Pro',
    featured: true,
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$49',
    tagline: 'For teams and serious growth',
    features: ['300 analyses / month', 'Advanced competitor analysis', 'Detailed performance reports', 'Full AI content studio', 'Unlimited connected accounts'],
    cta: 'Start with Elite',
  },
];

function useAuthed() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let alive = true;
    api('/auth/me').then(() => { if (alive) setAuthed(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return authed;
}

function MockDashboard() {
  const bars = [
    { label: 'Hook', value: 92 },
    { label: 'Editing', value: 78 },
    { label: 'Audio', value: 64 },
    { label: 'Retention', value: 81 },
  ];
  return (
    <div className="mock" aria-hidden="true">
      <div className="mock-head">
        <span>Viral potential report</span>
        <span className="badge badge-info">AI estimate</span>
      </div>
      <div className="mock-score">
        <div style={{ position: 'relative', width: 118, height: 118, flex: 'none' }}>
          <svg viewBox="0 0 120 120" width="118" height="118">
            <defs>
              <linearGradient id="landingRing" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
            <circle
              cx="60" cy="60" r="50" fill="none" stroke="url(#landingRing)" strokeWidth="9"
              strokeLinecap="round" strokeDasharray={2 * Math.PI * 50}
              strokeDashoffset={2 * Math.PI * 50 * (1 - 0.84)} transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="ring-center">
            <strong style={{ fontSize: 30 }}>84</strong>
            <span>/ 100</span>
          </div>
        </div>
        <div className="mock-bars">
          {bars.map((bar) => (
            <div key={bar.label} className="score-bar">
              <div className="score-bar-top"><span>{bar.label}</span><strong>{bar.value}</strong></div>
              <div className="bar-track">
                <div className={`bar-fill ${bar.value >= 80 ? 'bar-excellent' : bar.value >= 65 ? 'bar-strong' : 'bar-fair'}`} style={{ width: `${bar.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mock-foot">
        <div className="mock-tile"><span>Views</span><strong>184K</strong></div>
        <div className="mock-tile"><span>Followers</span><strong>48.2K</strong></div>
        <div className="mock-tile"><span>Engagement</span><strong>7.4%</strong></div>
      </div>
      <div className="mock-tag">Measured from your own file — not invented numbers.</div>
    </div>
  );
}

export default function Landing() {
  const authed = useAuthed();

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <div className="brand-mark">IN</div>
          <div>
            <div className="brand-name">INFLUENCER</div>
            <div className="brand-sub">AI growth studio</div>
          </div>
        </Link>
        <nav className="row" style={{ gap: 22 }}>
          <a className="nav-link" href="#features">Features</a>
          <a className="nav-link" href="#analysis">Analysis</a>
          <a className="nav-link" href="#pricing">Pricing</a>
        </nav>
        <div className="row" style={{ gap: 10 }}>
          {authed ? (
            <Link to="/app" className="btn btn-primary btn-sm">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
              <Link to="/signup" className="btn btn-primary btn-sm">Start free</Link>
            </>
          )}
        </div>
      </header>

      <main className="landing-main">
        <section className="hero">
          <div className="animate-in">
            <span className="hero-eyebrow">AI video intelligence for creators</span>
            <h1 className="hero-title">
              Find out why your last video <span className="gradient-text">flopped</span> — before you post the next one.
            </h1>
            <p className="hero-sub">
              INFLUENCER analyses your videos frame by frame, scores the hook, editing, audio and pacing, then tells you
              exactly what to fix. Upload a clip, get a strategist-grade report in under a minute.
            </p>
            <div className="hero-actions">
              <Link to={authed ? '/app/studio' : '/signup'} className="btn btn-primary btn-lg">
                {authed ? 'Analyse a video' : 'Analyse your first video'}
              </Link>
              <a href="#analysis" className="btn btn-outline btn-lg">See what we measure</a>
            </div>
            <div className="hero-points">
              <span><span className="tick">✓</span> No credit card required</span>
              <span><span className="tick">✓</span> Upload or import your content</span>
              <span><span className="tick">✓</span> Honest AI estimates, never guarantees</span>
            </div>
          </div>
          <div className="hero-visual">
            <MockDashboard />
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="row" style={{ gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--muted-2)', fontSize: 12.5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Built for
            </span>
            {PLATFORM_NAMES.map((name) => (
              <span key={name} className="chip">{name}</span>
            ))}
          </div>
        </section>

        <section className="section" id="features">
          <div className="section-head">
            <h2>One workspace for the whole growth loop</h2>
            <p>Analyse, fix, publish, measure — then let the assistant plan the next upload using what actually worked.</p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="feature">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="analysis">
          <div className="section-head">
            <h2>Twelve things we check on every video</h2>
            <p>
              Real measurements from your file — duration, loudness, shot changes, caption track, aspect ratio — combined
              with the context you provide about how it performed.
            </p>
          </div>
          <div className="grid grid-4" style={{ gap: 12 }}>
            {DIMENSIONS.map((dimension, index) => (
              <div key={dimension} className="card card-padded" style={{ padding: 16 }}>
                <div style={{ color: 'var(--cyan)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{dimension}</div>
              </div>
            ))}
          </div>
          <div className="banner banner-info" style={{ marginTop: 18 }}>
            <span>
              Scores are AI estimates designed to guide your next edit. No tool can guarantee a video goes viral, and
              INFLUENCER never claims to.
            </span>
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <h2>From upload to upload plan in three steps</h2>
          </div>
          <div className="feature-grid">
            {[
              { n: '01', t: 'Upload or connect', d: 'Drop an MP4, MOV or WebM — or connect a channel and import public stats where the official API allows it.' },
              { n: '02', t: 'Read the report', d: 'See the measured signals, the five scores, and a prioritised list of mistakes with the exact fix for each.' },
              { n: '03', t: 'Improve and export', d: 'Generate hooks, titles, captions and hashtags, then cut platform-specific versions for each network.' },
            ].map((step) => (
              <article key={step.n} className="feature">
                <div className="feature-icon" style={{ fontFamily: 'monospace', fontWeight: 700 }}>{step.n}</div>
                <h3>{step.t}</h3>
                <p>{step.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="pricing">
          <div className="section-head">
            <h2>Plans that scale with your posting</h2>
            <p>Demo pricing for this build — plan switches are instant and nothing is charged.</p>
          </div>
          <div className="pricing-grid">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`price-card${plan.featured ? ' featured' : ''}`}>
                <div>
                  <div className="row-between">
                    <h3 style={{ fontSize: 16 }}>{plan.name}</h3>
                    <span className="badge">{plan.tagline}</span>
                  </div>
                  <div className="price-amount" style={{ marginTop: 14 }}>
                    <strong>{plan.price}</strong>
                    <span>/ month · demo</span>
                  </div>
                </div>
                <ul className="price-features">
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <Link to={authed ? '/app/billing' : '/signup'} className={`btn ${plan.featured ? 'btn-primary' : 'btn-outline'} btn-block`}>
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="demo-note">
            Pricing is clearly labelled as demo until a payment provider is configured. No card details are collected.
          </p>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="card card-padded" style={{ padding: 'clamp(24px, 4vw, 44px)', textAlign: 'center' }}>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', letterSpacing: '-0.035em' }}>
              Stop guessing why the algorithm ignored you.
            </h2>
            <p style={{ color: 'var(--muted)', marginTop: 12, maxWidth: 560, marginInline: 'auto' }}>
              Upload one video and read the report. It takes less time than scrolling your analytics tab.
            </p>
            <div className="row" style={{ justifyContent: 'center', marginTop: 22 }}>
              <Link to={authed ? '/app/studio' : '/signup'} className="btn btn-primary btn-lg">
                {authed ? 'Open the studio' : 'Create your free account'}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} INFLUENCER — AI social media growth assistant.</span>
        <span>Analytics come from your own uploads and imports. Scores are estimates, not guarantees.</span>
      </footer>
    </div>
  );
}
