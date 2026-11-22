import { useEffect, useState } from 'react';
import { api, fmtDate, fmtNumber, fmtPercent } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, InfoNote, Input, Modal, Select, Textarea } from '../ui.jsx';

const PLATFORM_FALLBACK = [
  { id: 'tiktok', name: 'TikTok', accent: '#25F4EE' },
  { id: 'instagram', name: 'Instagram', accent: '#E1306C' },
  { id: 'youtube', name: 'YouTube', accent: '#FF0033' },
  { id: 'facebook', name: 'Facebook', accent: '#1877F2' },
  { id: 'x', name: 'X (Twitter)', accent: '#9CA3AF' },
  { id: 'threads', name: 'Threads', accent: '#A78BFA' },
  { id: 'snapchat', name: 'Snapchat', accent: '#FFFC00' },
  { id: 'linkedin', name: 'LinkedIn', accent: '#0A66C2' },
];

const today = () => new Date().toISOString().slice(0, 10);

export default function Accounts() {
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null, platforms: [] });
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [metricsFor, setMetricsFor] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const [form, setForm] = useState({ platform: 'tiktok', handle: '', profileUrl: '', followers: '', notes: '' });
  const [metrics, setMetrics] = useState({ date: today(), views: '', followers: '', likes: '', comments: '', shares: '' });
  const [csv, setCsv] = useState('date,platform,handle,views,followers,likes,comments,shares\n');

  async function load() {
    try {
      const [accounts, platforms] = await Promise.all([api('/accounts'), api('/platforms').catch(() => null)]);
      setState({
        loading: false,
        error: '',
        data: accounts,
        platforms: platforms?.platforms?.length ? platforms.platforms : PLATFORM_FALLBACK,
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }

  useEffect(() => { load(); }, []);

  async function submitAccount(event) {
    event.preventDefault();
    setBusy('add');
    setActionError('');
    try {
      const result = await api('/accounts', {
        method: 'POST',
        body: {
          platform: form.platform,
          handle: form.handle,
          profileUrl: form.profileUrl || undefined,
          followers: form.followers === '' ? 0 : Number(form.followers),
          notes: form.notes || undefined,
        },
      });
      setAddOpen(false);
      setForm({ platform: 'tiktok', handle: '', profileUrl: '', followers: '', notes: '' });
      setNotice(result.notice || 'Account connected.');
      await load();
      await refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function sync(account) {
    setBusy(account.id);
    setActionError('');
    setNotice('');
    try {
      const result = await api(`/accounts/${account.id}/sync`, { method: 'POST' });
      setNotice(result.note || 'Account synced.');
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function remove(account) {
    if (!window.confirm(`Disconnect ${account.platformName} @${account.handle}? Its metrics will be removed.`)) return;
    setBusy(account.id);
    setActionError('');
    try {
      await api(`/accounts/${account.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function saveMetrics(event) {
    event.preventDefault();
    if (!metricsFor) return;
    setBusy('metrics');
    setActionError('');
    try {
      await api(`/accounts/${metricsFor.id}/metrics`, {
        method: 'POST',
        body: {
          date: metrics.date,
          views: Number(metrics.views) || 0,
          followers: Number(metrics.followers) || 0,
          likes: Number(metrics.likes) || 0,
          comments: Number(metrics.comments) || 0,
          shares: Number(metrics.shares) || 0,
        },
      });
      setMetricsFor(null);
      setMetrics({ date: today(), views: '', followers: '', likes: '', comments: '', shares: '' });
      setNotice('Metrics saved.');
      await load();
      await refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function importCsv(event) {
    event.preventDefault();
    setBusy('import');
    setActionError('');
    try {
      const result = await api('/metrics/import', { method: 'POST', body: { csv } });
      setImportOpen(false);
      setNotice(`Imported ${result.imported ?? result.rows ?? 0} metric rows${result.createdAccounts ? ` and ${result.createdAccounts} new accounts` : ''}.`);
      await load();
      await refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function demo(mode) {
    setBusy('demo');
    setActionError('');
    setNotice('');
    try {
      if (mode === 'add') await api('/metrics/sample', { method: 'POST' });
      else await api('/metrics/sample', { method: 'DELETE' });
      await load();
      await refresh();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  const accounts = state.data?.accounts || [];
  const platforms = state.platforms;
  const usage = state.data?.usage;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Connected accounts</h1>
          <p className="page-sub">
            Add every channel you publish on. Stats come from official APIs where configured, otherwise from your own
            imports.
          </p>
        </div>
        <div className="page-actions">
          <Button variant="outline" onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button variant="primary" onClick={() => { setActionError(''); setAddOpen(true); }}>Add account</Button>
        </div>
      </div>

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
      {notice ? <InfoNote tone="success">{notice}</InfoNote> : null}

      {usage ? (
        <div className="mini-stats">
          <div className="mini-stat"><span>Accounts</span><strong>{accounts.length}</strong></div>
          <div className="mini-stat"><span>Analyses this month</span><strong>{usage.used} / {usage.limit}</strong></div>
          <div className="mini-stat"><span>Competitor slots</span><strong>{usage.competitorSlots}</strong></div>
        </div>
      ) : null}

      {state.loading ? (
        <div className="grid grid-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔗"
            title="No accounts connected yet"
            text="Connect your first channel, import a CSV export from any platform, or load demo data to explore the dashboard."
            action={
              <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={() => setAddOpen(true)}>Add account</Button>
                <Button variant="outline" onClick={() => setImportOpen(true)}>Import CSV</Button>
                <Button variant="ghost" loading={busy === 'demo'} onClick={() => demo('add')}>Load demo data</Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-3">
          {accounts.map((account) => (
            <div key={account.id} className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row-between">
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <span
                    className="platform-initials"
                    style={{ background: `${account.accent || '#8b5cf6'}22`, color: account.accent || '#8b5cf6' }}
                  >
                    {account.platformName?.slice(0, 2).toUpperCase() || '??'}
                  </span>
                  <div>
                    <strong style={{ fontSize: 14 }}>@{account.handle}</strong>
                    <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>{account.platformName}</div>
                  </div>
                </div>
                <Badge tone={account.connectionType === 'manual' ? 'warn' : account.connectionType === 'sample' ? 'info' : 'success'}>
                  {account.connectionType === 'manual' ? 'Manual' : account.connectionType === 'sample' ? 'Demo' : 'API'}
                </Badge>
              </div>

              <div className="grid grid-2" style={{ gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Followers</div>
                  <strong style={{ fontSize: 17 }}>{fmtNumber(account.followers)}</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Videos</div>
                  <strong style={{ fontSize: 17 }}>{account.videos ?? 0}</strong>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>
                {account.analyses ? `${account.analyses} analysed` : 'No analyses yet'} ·{' '}
                {account.lastSyncedAt ? `synced ${fmtDate(account.lastSyncedAt)}` : `added ${fmtDate(account.createdAt)}`}
              </div>

              <div className="row" style={{ gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                <Button size="sm" variant="outline" onClick={() => { setMetricsFor(account); setActionError(''); }}>
                  Add stats
                </Button>
                <Button size="sm" variant="ghost" loading={busy === account.id} onClick={() => sync(account)}>
                  Sync
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(account)}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card title="Platform integrations" subtitle="Official API credentials detected on this deployment.">
        <div className="stack" style={{ gap: 10 }}>
          {platforms.map((platform) => {
            const integration = platform.integration || {};
            const configured = Boolean(integration.configured);
            return (
              <div key={platform.id} className="row-between" style={{ fontSize: 13, gap: 12 }}>
                <div>
                  <strong>{platform.name}</strong>
                  <div style={{ fontSize: 11.5, color: 'var(--muted-2)' }}>{platform.apiScope || 'Public profile data'}</div>
                </div>
                <Badge tone={configured ? 'success' : 'warn'}>{configured ? 'API ready' : 'Manual mode'}</Badge>
              </div>
            );
          })}
        </div>
        <p style={{ color: 'var(--muted-2)', fontSize: 12, marginTop: 14 }}>
          Manual mode never invents numbers: you enter or import the stats you can see in each platform's own analytics.
          Add credentials in Settings → Environment variables to enable live sync.
        </p>
      </Card>

      {state.data?.hasSampleData ? (
        <div className="row-between">
          <InfoNote>Demo accounts and metrics are loaded.</InfoNote>
          <Button size="sm" variant="ghost" loading={busy === 'demo'} onClick={() => demo('remove')}>Remove demo data</Button>
        </div>
      ) : null}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Connect an account"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'add'} onClick={submitAccount}>Connect account</Button>
          </>
        }
      >
        <form onSubmit={submitAccount} className="stack" style={{ gap: 14 }}>
          <Field label="Platform" htmlFor="platform">
            <Select id="platform" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}>
              {platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Handle" htmlFor="handle" hint="Without the @ symbol.">
            <Input id="handle" value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} required minLength={2} />
          </Field>
          <Field label="Profile URL" htmlFor="url" hint="Optional public link.">
            <Input id="url" value={form.profileUrl} onChange={(e) => setForm((f) => ({ ...f, profileUrl: e.target.value }))} placeholder="https://" />
          </Field>
          <Field label="Current followers" htmlFor="followers" hint="Used as the starting point for growth charts.">
            <Input id="followers" type="number" min="0" value={form.followers} onChange={(e) => setForm((f) => ({ ...f, followers: e.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="notes" hint="Optional context, e.g. niche or posting cadence.">
            <Input id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} maxLength={300} />
          </Field>
          {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(metricsFor)}
        onClose={() => setMetricsFor(null)}
        title={`Add stats${metricsFor ? ` — @${metricsFor.handle}` : ''}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMetricsFor(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'metrics'} onClick={saveMetrics}>Save stats</Button>
          </>
        }
      >
        <form onSubmit={saveMetrics} className="stack" style={{ gap: 14 }}>
          <Field label="Date" htmlFor="mdate">
            <Input id="mdate" type="date" value={metrics.date} onChange={(e) => setMetrics((m) => ({ ...m, date: e.target.value }))} required />
          </Field>
          <div className="form-grid">
            <Field label="Views" htmlFor="mviews">
              <Input id="mviews" type="number" min="0" value={metrics.views} onChange={(e) => setMetrics((m) => ({ ...m, views: e.target.value }))} />
            </Field>
            <Field label="Followers" htmlFor="mfollowers">
              <Input id="mfollowers" type="number" min="0" value={metrics.followers} onChange={(e) => setMetrics((m) => ({ ...m, followers: e.target.value }))} />
            </Field>
            <Field label="Likes" htmlFor="mlikes">
              <Input id="mlikes" type="number" min="0" value={metrics.likes} onChange={(e) => setMetrics((m) => ({ ...m, likes: e.target.value }))} />
            </Field>
            <Field label="Comments" htmlFor="mcomments">
              <Input id="mcomments" type="number" min="0" value={metrics.comments} onChange={(e) => setMetrics((m) => ({ ...m, comments: e.target.value }))} />
            </Field>
            <Field label="Shares" htmlFor="mshares">
              <Input id="mshares" type="number" min="0" value={metrics.shares} onChange={(e) => setMetrics((m) => ({ ...m, shares: e.target.value }))} />
            </Field>
          </div>
          {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
        </form>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import metrics CSV"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'import'} onClick={importCsv}>Import rows</Button>
          </>
        }
      >
        <form onSubmit={importCsv} className="stack" style={{ gap: 14 }}>
          <InfoNote>
            Export analytics from TikTok, Instagram, YouTube or X and paste it here. Required columns: date, platform,
            handle, views, followers, likes, comments, shares. Accounts that do not exist yet are created automatically.
          </InfoNote>
          <Field label="CSV" htmlFor="csv" hint="First row must be the header row.">
            <Textarea id="csv" rows={10} value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} />
          </Field>
          <label className="file-pill">
            <input
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setCsv(await file.text());
              }}
            />
            Choose a .csv file
          </label>
          {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
        </form>
      </Modal>
    </div>
  );
}
