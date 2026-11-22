import { useEffect, useState } from 'react';
import { api, fmtDate, fmtNumber, fmtPercent } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, InfoNote, Input, Modal, Select } from '../ui.jsx';

const PLATFORMS = [
  ['tiktok', 'TikTok'],
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['facebook', 'Facebook'],
  ['x', 'X (Twitter)'],
  ['threads', 'Threads'],
  ['snapchat', 'Snapchat'],
  ['linkedin', 'LinkedIn'],
];

const emptyCompetitor = { platform: 'tiktok', handle: '', name: '', niche: '' };
const emptyPost = { title: '', url: '', postedAt: '', views: '', likes: '', comments: '', shares: '', format: '', topic: '' };

export default function Competitors() {
  const { plan } = useAuth();
  const [state, setState] = useState({ loading: true, competitors: [], analysis: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [postFor, setPostFor] = useState(null);
  const [form, setForm] = useState(emptyCompetitor);
  const [post, setPost] = useState(emptyPost);

  async function load() {
    try {
      const [list, analysis] = await Promise.all([
        api('/competitors'),
        api('/competitors/analysis').catch(() => null),
      ]);
      setState({ loading: false, competitors: list.competitors || [], analysis });
      setError('');
    } catch (err) {
      setState({ loading: false, competitors: [], analysis: null });
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function addCompetitor(event) {
    event.preventDefault();
    setBusy('add');
    setError('');
    try {
      await api('/competitors', { method: 'POST', body: form });
      setForm(emptyCompetitor);
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function addPost(event) {
    event.preventDefault();
    setBusy('post');
    setError('');
    try {
      const body = { ...post };
      Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
      await api(`/competitors/${postFor.id}/posts`, { method: 'POST', body });
      setPost(emptyPost);
      setPostFor(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function sync(id) {
    setBusy(id);
    setError('');
    try {
      await api(`/competitors/${id}/sync`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function remove(id) {
    if (!window.confirm('Remove this competitor and its public post data?')) return;
    setBusy(id);
    try {
      await api(`/competitors/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const analysis = state.analysis;
  const insights = analysis?.insights || analysis?.comparison || [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Competitor analysis</h1>
          <p className="page-sub">Compare public content strategy, formats, posting rhythm and engagement.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" onClick={() => setAddOpen(true)}>Add competitor</Button>
        </div>
      </div>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <InfoNote>
        Only publicly visible content and engagement is tracked. Private account data is never accessed, and public
        numbers are entered or fetched as reported by the platform.
      </InfoNote>

      {state.loading ? (
        <div className="grid grid-3">
          <div className="skeleton" style={{ height: 180 }} />
          <div className="skeleton" style={{ height: 180 }} />
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      ) : state.competitors.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔍"
            title="No competitors tracked yet"
            text="Add a public account to compare formats, posting frequency and public engagement against your own content."
            action={<Button variant="primary" onClick={() => setAddOpen(true)}>Add your first competitor</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-3">
          {state.competitors.map((competitor) => (
            <Card key={competitor.id} padded>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <strong style={{ fontSize: 15 }}>{competitor.name || `@${competitor.handle}`}</strong>
                  <div style={{ color: 'var(--muted-2)', fontSize: 12 }}>
                    {competitor.platformName || competitor.platform} · @{competitor.handle}
                  </div>
                </div>
                <Badge tone="info">{competitor.posts} posts</Badge>
              </div>

              <div className="mini-stats" style={{ marginTop: 14 }}>
                <div className="mini-stat"><span>Avg views</span><strong>{fmtNumber(competitor.avgViews)}</strong></div>
                <div className="mini-stat"><span>Engagement</span><strong>{fmtPercent(competitor.engagementRate)}</strong></div>
                <div className="mini-stat"><span>Posts / week</span><strong>{competitor.postsPerWeek ?? '—'}</strong></div>
              </div>

              {competitor.formats?.length ? (
                <div style={{ marginTop: 12 }}>
                  <span className="section-label" style={{ fontSize: 11 }}>Formats</span>
                  <div className="tag-row">
                    {competitor.formats.slice(0, 4).map((format) => (
                      <span key={format.format} className="chip">{format.format} · {format.count}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              {competitor.topics?.length ? (
                <div style={{ marginTop: 10 }}>
                  <span className="section-label" style={{ fontSize: 11 }}>Topics</span>
                  <div className="tag-row">
                    {competitor.topics.slice(0, 4).map((topic) => (
                      <span key={topic.topic} className="chip">{topic.topic}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <Button size="sm" variant="outline" onClick={() => { setPostFor(competitor); setPost(emptyPost); }}>Add post</Button>
                <Button size="sm" variant="ghost" loading={busy === competitor.id} onClick={() => sync(competitor.id)}>Sync</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(competitor.id)}>Remove</Button>
              </div>
              {competitor.lastSyncedAt ? (
                <div style={{ color: 'var(--muted-2)', fontSize: 11, marginTop: 8 }}>Last synced {fmtDate(competitor.lastSyncedAt)}</div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {analysis ? (
        <Card
          title="Strategy comparison"
          subtitle={analysis.basis || 'Your analysed content against tracked public competitor posts.'}
        >
          {Array.isArray(insights) && insights.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {insights.map((insight, index) => (
                <div key={index} className="insight-row">
                  <div>
                    <strong style={{ fontSize: 13.5 }}>{insight.area || insight.title || insight.label}</strong>
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{insight.detail || insight.text}</p>
                    {insight.action ? (
                      <p style={{ fontSize: 13, marginTop: 6 }}><strong style={{ color: 'var(--violet)' }}>Try: </strong>{insight.action}</p>
                    ) : null}
                  </div>
                  {insight.tone ? <Badge tone={insight.tone === 'gap' ? 'weak' : insight.tone === 'edge' ? 'success' : 'info'}>{insight.tone}</Badge> : null}
                </div>
              ))}
            </div>
          ) : analysis.summary ? (
            <p style={{ fontSize: 14 }}>{analysis.summary}</p>
          ) : (
            <EmptyState icon="📊" title="Not enough data yet" text="Add a few public posts to unlock the comparison." />
          )}
          {analysis.summary && insights.length ? (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>{analysis.summary}</p>
          ) : null}
          <p style={{ color: 'var(--muted-2)', fontSize: 12, marginTop: 12 }}>
            {analysis.disclaimer || 'Comparison uses publicly visible figures only.'}
          </p>
        </Card>
      ) : null}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a competitor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'add'} onClick={addCompetitor}>Add competitor</Button>
          </>
        }
      >
        <form className="stack" style={{ gap: 14 }} onSubmit={addCompetitor}>
          <Field label="Platform" htmlFor="c-platform">
            <Select id="c-platform" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}>
              {PLATFORMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Public handle" htmlFor="c-handle" hint="Without the @ symbol.">
            <Input id="c-handle" value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} required maxLength={80} />
          </Field>
          <Field label="Display name" htmlFor="c-name">
            <Input id="c-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={120} />
          </Field>
          <Field label="Niche" htmlFor="c-niche" hint="Used to group topics and formats.">
            <Input id="c-niche" value={form.niche} onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))} maxLength={80} />
          </Field>
          <p style={{ color: 'var(--muted-2)', fontSize: 12 }}>
            Your current plan: {plan?.name || 'Free'}. Advanced competitor tracking is part of Elite.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(postFor)}
        onClose={() => setPostFor(null)}
        title={postFor ? `Add public post · @${postFor.handle}` : 'Add public post'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPostFor(null)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'post'} onClick={addPost}>Save post</Button>
          </>
        }
      >
        <form className="stack" style={{ gap: 14 }} onSubmit={addPost}>
          <Field label="Post title or hook" htmlFor="p-title">
            <Input id="p-title" value={post.title} onChange={(e) => setPost((p) => ({ ...p, title: e.target.value }))} required maxLength={200} />
          </Field>
          <div className="form-grid">
            <Field label="Public URL" htmlFor="p-url">
              <Input id="p-url" value={post.url} onChange={(e) => setPost((p) => ({ ...p, url: e.target.value }))} placeholder="https://" maxLength={400} />
            </Field>
            <Field label="Posted on" htmlFor="p-date">
              <Input id="p-date" type="date" value={post.postedAt} onChange={(e) => setPost((p) => ({ ...p, postedAt: e.target.value }))} />
            </Field>
            <Field label="Views" htmlFor="p-views">
              <Input id="p-views" type="number" min="0" value={post.views} onChange={(e) => setPost((p) => ({ ...p, views: e.target.value }))} />
            </Field>
            <Field label="Likes" htmlFor="p-likes">
              <Input id="p-likes" type="number" min="0" value={post.likes} onChange={(e) => setPost((p) => ({ ...p, likes: e.target.value }))} />
            </Field>
            <Field label="Comments" htmlFor="p-comments">
              <Input id="p-comments" type="number" min="0" value={post.comments} onChange={(e) => setPost((p) => ({ ...p, comments: e.target.value }))} />
            </Field>
            <Field label="Shares" htmlFor="p-shares">
              <Input id="p-shares" type="number" min="0" value={post.shares} onChange={(e) => setPost((p) => ({ ...p, shares: e.target.value }))} />
            </Field>
            <Field label="Format" htmlFor="p-format">
              <Input id="p-format" value={post.format} onChange={(e) => setPost((p) => ({ ...p, format: e.target.value }))} placeholder="talking head, tutorial…" maxLength={40} />
            </Field>
            <Field label="Topic" htmlFor="p-topic">
              <Input id="p-topic" value={post.topic} onChange={(e) => setPost((p) => ({ ...p, topic: e.target.value }))} placeholder="productivity, fitness…" maxLength={40} />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
