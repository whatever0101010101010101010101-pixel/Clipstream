import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, ErrorBanner, Field, Input, Spinner } from '../ui.jsx';

const VALUE_POINTS = [
  'Frame-accurate hook, pacing and audio checks on every upload',
  'A prioritised fix list instead of a wall of vanity metrics',
  'Hooks, titles, captions and hashtags generated from your own results',
  'Competitor benchmarking using public data only',
];

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { user, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to={location.state?.from || '/app'} replace />;
  }

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = isSignup
        ? { name: form.name.trim(), email: form.email.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password };
      const data = await api(isSignup ? '/auth/signup' : '/auth/login', { method: 'POST', body: payload });
      signIn(data);
      navigate(location.state?.from || '/app', { replace: true });
    } catch (err) {
      setError(err.message || 'We could not complete that request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <Link to="/" className="brand">
          <div className="brand-mark">IN</div>
          <div>
            <div className="brand-name">INFLUENCER</div>
            <div className="brand-sub">AI growth studio</div>
          </div>
        </Link>
        <div>
          <h1>The video analyst and strategist your channel never had.</h1>
          <p>
            Connect your accounts, upload a clip, and get a report that names the exact mistakes — plus the edit that
            fixes them.
          </p>
          <ul className="auth-list">
            {VALUE_POINTS.map((point) => (
              <li key={point}><span>✦</span><span>{point}</span></li>
            ))}
          </ul>
        </div>
        <p style={{ color: 'var(--muted-2)', fontSize: 12 }}>
          Scores are AI estimates based on measured video signals. They are not a guarantee of reach or virality.
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div>
            <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
            <p style={{ marginTop: 8 }}>
              {isSignup
                ? 'Free plan includes five video analyses a month. No card required.'
                : 'Sign in to pick up your analyses, accounts and growth plan.'}
            </p>
          </div>

          {error && <ErrorBanner>{error}</ErrorBanner>}

          <form onSubmit={onSubmit} className="stack" style={{ gap: 14 }}>
            {isSignup && (
              <Field label="Your name" htmlFor="name">
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="Alex Rivera"
                  value={form.name}
                  onChange={set('name')}
                  required
                  minLength={2}
                  maxLength={80}
                />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@channel.com"
                value={form.email}
                onChange={set('email')}
                required
              />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              hint={isSignup ? 'At least 8 characters.' : undefined}
            >
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={form.password}
                onChange={set('password')}
                required
                minLength={8}
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" block disabled={busy}>
              {busy ? <><Spinner size={15} /> {isSignup ? 'Creating account…' : 'Signing in…'}</> : isSignup ? 'Create free account' : 'Sign in'}
            </Button>
          </form>

          <p className="auth-switch">
            {isSignup ? (
              <>Already have an account? <Link to="/login">Sign in</Link></>
            ) : (
              <>New to INFLUENCER? <Link to="/signup">Create an account</Link></>
            )}
          </p>
          <p className="auth-switch" style={{ fontSize: 11.5 }}>
            By continuing you agree that analysis scores are estimates for guidance only.
          </p>
        </div>
      </main>
    </div>
  );
}
