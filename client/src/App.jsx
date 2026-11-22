import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Spinner, ToastProvider } from './ui.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import Landing from './pages/Landing.jsx';
import AuthPage from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Studio from './pages/Studio.jsx';
import VideoDetail from './pages/VideoDetail.jsx';
import Accounts from './pages/Accounts.jsx';
import Competitors from './pages/Competitors.jsx';
import Assistant from './pages/Assistant.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';

/* --------------------------------- Icons --------------------------------- */
const ICONS = {
  dashboard: 'M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z',
  studio: 'M4 5h16v14H4zM10 9l5 3-5 3z',
  accounts: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  competitors: 'M3 17l6-6 4 4 7-7M14 8h7v7',
  assistant: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  billing: 'M2 7h20v11H2zM2 11h20M6 15h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a7.9 7.9 0 0 0 0-6l1.7-1.2-2-3.4-2 .8a8 8 0 0 0-5.2-3l-.3-2.2h-4l-.3 2.2a8 8 0 0 0-5.2 3l-2-.8-2 3.4L.8 9a7.9 7.9 0 0 0 0 6l-1.7 1.2 2 3.4 2-.8a8 8 0 0 0 5.2 3l.3 2.2h4l.3-2.2a8 8 0 0 0 5.2-3l2 .8 2-3.4z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  plus: 'M12 5v14M5 12h14',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name] || ICONS.dashboard} />
    </svg>
  );
}

/* -------------------------------- Shell ---------------------------------- */
const NAV = [
  { to: '/app', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/app/studio', label: 'Viral Studio', icon: 'studio' },
  { to: '/app/accounts', label: 'Accounts', icon: 'accounts' },
  { to: '/app/competitors', label: 'Competitors', icon: 'competitors' },
  { to: '/app/assistant', label: 'AI Assistant', icon: 'assistant' },
  { to: '/app/billing', label: 'Plan & Billing', icon: 'billing' },
  { to: '/app/settings', label: 'Settings', icon: 'settings' },
];

const TITLES = {
  '/app': 'Dashboard',
  '/app/studio': 'Viral Content Studio',
  '/app/accounts': 'Connected accounts',
  '/app/competitors': 'Competitor analysis',
  '/app/assistant': 'AI content assistant',
  '/app/billing': 'Plan & billing',
  '/app/settings': 'Settings',
};

function initials(user) {
  const source = user?.name || user?.email || 'U';
  return source.trim().slice(0, 2).toUpperCase();
}

function UsageMini({ usage, plan }) {
  const limit = usage?.analysisLimit;
  const used = usage?.analyses ?? 0;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="usage-mini">
      <div className="usage-mini-top">
        <span>{plan?.name || 'Free'} plan</span>
        <strong>{used}/{limit ?? '∞'}</strong>
      </div>
      <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      <div className="usage-mini-top" style={{ marginTop: 8, marginBottom: 0 }}>
        <span style={{ fontSize: 11 }}>analyses this month</span>
      </div>
    </div>
  );
}

function AppLayout({ children }) {
  const { user, plan, usage, signOut } = useAuth();
  const { pathname } = useLocation();
  const title = TITLES[pathname] || (pathname.startsWith('/app/studio/') ? 'Video analysis' : 'INFLUENCER');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/app" className="brand">
          <div className="brand-mark">IN</div>
          <div>
            <div className="brand-name">INFLUENCER</div>
            <div className="brand-sub">AI growth studio</div>
          </div>
        </Link>
        <nav className="nav">
          <div className="nav-label">Workspace</div>
          {NAV.slice(0, 5).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <div className="nav-label">Account</div>
          {NAV.slice(5).map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <UsageMini usage={usage} plan={plan} />
          <div className="user-chip">
            <div className="avatar">{initials(user)}</div>
            <div className="user-meta">
              <strong>{user?.name || 'Creator'}</strong>
              <span>{user?.email}</span>
            </div>
            <button type="button" className="icon-btn" title="Sign out" aria-label="Sign out" onClick={signOut}>
              <Icon name="logout" size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row" style={{ gap: 12 }}>
            <Link to="/app" className="brand" style={{ padding: 0 }}>
              <div className="brand-mark" style={{ width: 30, height: 30, borderRadius: 9, fontSize: 13 }}>IN</div>
            </Link>
            <span className="topbar-title">{title}</span>
          </div>
          <div className="topbar-actions">
            <Link to="/app/billing" className="badge badge-plan" style={{ textDecoration: 'none' }}>
              {plan?.name || 'Free'}
            </Link>
            <Link to="/app/studio" className="btn btn-primary btn-sm">
              <Icon name="plus" size={14} /> New analysis
            </Link>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Primary">
        {[NAV[0], NAV[1], NAV[2], NAV[4], NAV[6]].map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={item.icon} />
            <span>{item.label.replace('Viral Studio', 'Studio').replace('Plan & Billing', 'Billing')}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function RequireAuth({ children }) {
  const { loading, user } = useAuth();
  const { pathname } = useLocation();
  if (loading) {
    return (
      <div className="page-loader">
        <Spinner size={26} />
        <span>Loading your workspace…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  return <AppLayout>{children}</AppLayout>;
}

/* --------------------------------- App ----------------------------------- */
export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/app" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/app/studio" element={<RequireAuth><Studio /></RequireAuth>} />
          <Route path="/app/studio/:id" element={<RequireAuth><VideoDetail /></RequireAuth>} />
          <Route path="/app/accounts" element={<RequireAuth><Accounts /></RequireAuth>} />
          <Route path="/app/competitors" element={<RequireAuth><Competitors /></RequireAuth>} />
          <Route path="/app/assistant" element={<RequireAuth><Assistant /></RequireAuth>} />
          <Route path="/app/billing" element={<RequireAuth><Billing /></RequireAuth>} />
          <Route path="/app/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
