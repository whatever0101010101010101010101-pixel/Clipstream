import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Card, ErrorBanner, Field, InfoNote, Input } from '../ui.jsx';

export default function Settings() {
  const { user, plan, usage, refresh, signOut } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [profileState, setProfileState] = useState({ busy: false, error: '', ok: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [passwordState, setPasswordState] = useState({ busy: false, error: '', ok: '' });
  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleteState, setDeleteState] = useState({ busy: false, error: '' });
  const [integrations, setIntegrations] = useState(null);

  useEffect(() => { setName(user?.name || ''); }, [user?.name]);

  useEffect(() => {
    let alive = true;
    api('/platforms')
      .then((data) => { if (alive) setIntegrations(data); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setProfileState({ busy: true, error: '', ok: '' });
    try {
      await api('/me', { method: 'PATCH', body: { name } });
      await refresh();
      setProfileState({ busy: false, error: '', ok: 'Profile updated.' });
    } catch (err) {
      setProfileState({ busy: false, error: err.message, ok: '' });
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordState({ busy: true, error: '', ok: '' });
    try {
      await api('/me/password', { method: 'POST', body: passwords });
      setPasswords({ currentPassword: '', newPassword: '' });
      setPasswordState({ busy: false, error: '', ok: 'Password changed.' });
    } catch (err) {
      setPasswordState({ busy: false, error: err.message, ok: '' });
    }
  }

  async function deleteAccount() {
    setDeleteState({ busy: true, error: '' });
    try {
      await api('/me', { method: 'DELETE' });
      await signOut();
    } catch (err) {
      setDeleteState({ busy: false, error: err.message });
    }
  }

  const integrationRows = [
    { key: 'ai', label: 'AI provider (LLM)', on: Boolean(integrations?.llm?.configured), env: 'OPENAI_API_KEY' },
    { key: 'yt', label: 'YouTube Data API', on: Boolean(integrations?.youtubeApi?.configured), env: 'YOUTUBE_API_KEY' },
    { key: 'pay', label: 'Payment provider', on: Boolean(integrations?.payments?.configured), env: 'STRIPE_SECRET_KEY' },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Manage your profile, password, plan and integration status.</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Profile" subtitle="This name appears on your reports and dashboard.">
          {profileState.error ? <div style={{ marginBottom: 12 }}><ErrorBanner>{profileState.error}</ErrorBanner></div> : null}
          {profileState.ok ? <div style={{ marginBottom: 12 }}><InfoNote tone="success">{profileState.ok}</InfoNote></div> : null}
          <form onSubmit={saveProfile} className="stack" style={{ gap: 14 }}>
            <Field label="Display name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
            </Field>
            <Field label="Email" htmlFor="email" hint="Email changes are not enabled in this build.">
              <Input id="email" value={user?.email || ''} disabled />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" loading={profileState.busy}>Save profile</Button>
            </div>
          </form>
        </Card>

        <Card title="Password" subtitle="Use at least 8 characters.">
          {passwordState.error ? <div style={{ marginBottom: 12 }}><ErrorBanner>{passwordState.error}</ErrorBanner></div> : null}
          {passwordState.ok ? <div style={{ marginBottom: 12 }}><InfoNote tone="success">{passwordState.ok}</InfoNote></div> : null}
          <form onSubmit={changePassword} className="stack" style={{ gap: 14 }}>
            <Field label="Current password" htmlFor="current">
              <Input
                id="current" type="password" autoComplete="current-password" required
                value={passwords.currentPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              />
            </Field>
            <Field label="New password" htmlFor="next">
              <Input
                id="next" type="password" autoComplete="new-password" minLength={8} required
                value={passwords.newPassword}
                onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              />
            </Field>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" loading={passwordState.busy}>Change password</Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Account" subtitle={`Member since ${fmtDate(user?.createdAt)}`}>
          <div className="stack" style={{ gap: 10, fontSize: 13.5 }}>
            <div className="row-between"><span style={{ color: 'var(--muted)' }}>Current plan</span><strong>{plan?.name || 'Free'}</strong></div>
            <div className="row-between"><span style={{ color: 'var(--muted)' }}>Analyses this month</span><strong>{usage?.used ?? 0} / {usage?.limit ?? '∞'}</strong></div>
            <div className="row-between"><span style={{ color: 'var(--muted)' }}>Competitor slots</span><strong>{plan?.competitorSlots ?? 0}</strong></div>
            <div className="row-between"><span style={{ color: 'var(--muted)' }}>AI assistant</span><strong>{plan?.assistant ? 'Included' : 'Pro and Elite only'}</strong></div>
          </div>
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </div>
        </Card>

        <Card title="Integrations" subtitle="Optional providers that unlock live data. The app works without them.">
          <div className="stack" style={{ gap: 10 }}>
            {integrationRows.map((row) => (
              <div key={row.key} className="row-between" style={{ fontSize: 13 }}>
                <span>{row.label}</span>
                <span className={`badge ${row.on ? 'badge-success' : 'badge-warn'}`}>
                  {row.on ? 'Connected' : `Add ${row.env}`}
                </span>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--muted-2)', fontSize: 12, marginTop: 14 }}>
            Add keys in Settings → Environment variables. Until then, analysis uses measured video signals with rule-based
            recommendations and you can import stats manually.
          </p>
        </Card>
      </div>

      <Card title="Danger zone" subtitle="Deleting your account removes all videos, analyses, metrics and competitor data.">
        {deleteState.error ? <div style={{ marginBottom: 12 }}><ErrorBanner>{deleteState.error}</ErrorBanner></div> : null}
        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field label={`Type DELETE to confirm`} htmlFor="confirm">
              <Input id="confirm" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder="DELETE" />
            </Field>
          </div>
          <Button
            variant="danger"
            disabled={confirmDelete !== 'DELETE'}
            loading={deleteState.busy}
            onClick={deleteAccount}
          >
            Delete my account
          </Button>
        </div>
      </Card>
    </div>
  );
}
