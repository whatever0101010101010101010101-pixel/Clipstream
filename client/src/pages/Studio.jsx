import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmtDate, fmtDuration, fmtNumber, uploadVideo } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, InfoNote, Input, Select, Textarea } from '../ui.jsx';

const STATUS_TONE = { queued: 'info', analyzing: 'info', done: 'success', error: 'weak' };
const STATUS_LABEL = { queued: 'Queued', analyzing: 'Analysing', done: 'Analysed', error: 'Failed' };

const emptyForm = {
  platform: 'tiktok',
  title: '',
  topic: '',
  hasCaptions: 'unknown',
  structure: '',
  hasCta: '',
  originality: 'unknown',
  retentionPct: '',
  accountId: '',
  views: '',
  likes: '',
  comments: '',
  shares: '',
};

export default function Studio() {
  const navigate = useNavigate();
  const { usage, plan, refresh } = useAuth();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [state, setState] = useState({ loading: true, videos: [], accounts: [] });

  async function load() {
    try {
      const [videos, accounts] = await Promise.all([api('/videos'), api('/accounts').catch(() => ({ accounts: [] }))]);
      setState({ loading: false, videos: videos.videos || [], accounts: accounts.accounts || [] });
    } catch (err) {
      setState({ loading: false, videos: [], accounts: [] });
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  function pickFile(nextFile) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(nextFile.name)) {
      setError('That file does not look like a video. Upload an MP4, MOV, WebM or MKV clip.');
      return;
    }
    setError('');
    setFile(nextFile);
    if (!form.title) setForm((f) => ({ ...f, title: nextFile.name.replace(/\.[^.]+$/, '').slice(0, 140) }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!file) {
      setError('Choose a video file to analyse.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('video', file);
      body.append('platform', form.platform);
      body.append('title', form.title || file.name);
      if (form.topic) body.append('topic', form.topic);
      body.append('hasCaptions', form.hasCaptions);
      if (form.structure) body.append('structure', form.structure);
      if (form.hasCta) body.append('hasCta', form.hasCta);
      body.append('originality', form.originality);
      if (form.retentionPct) body.append('retentionPct', form.retentionPct);
      if (form.accountId) body.append('accountId', form.accountId);
      ['views', 'likes', 'comments', 'shares'].forEach((key) => {
        if (form[key] !== '') body.append(key, form[key]);
      });
      const result = await uploadVideo(body);
      await refresh();
      setForm(emptyForm);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      navigate(`/app/studio/${result.video.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const used = usage?.used ?? 0;
  const limit = usage?.limit ?? plan?.analysesPerMonth ?? 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Viral content studio</h1>
          <p className="page-sub">Upload a clip, get a measured breakdown, then rebuild the hook, pacing and packaging.</p>
        </div>
        <div className="page-actions">
          <Badge tone={limit && used >= limit ? 'weak' : 'info'}>{used} / {limit || '∞'} analyses used</Badge>
        </div>
      </div>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}
      {notice ? <InfoNote tone="success">{notice}</InfoNote> : null}

      <div className="upload-layout">
        <Card title="Upload a video" subtitle="MP4, MOV, WebM or MKV. Everything is analysed on this server with ffmpeg.">
          <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
            <div
              className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInput.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click(); }}
            >
              <input
                ref={fileInput}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {file ? (
                <div className="stack" style={{ gap: 6 }}>
                  <strong>{file.name}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                    {(file.size / (1024 * 1024)).toFixed(1)} MB · click to replace
                  </span>
                </div>
              ) : (
                <div className="stack" style={{ gap: 6 }}>
                  <span style={{ fontSize: 26 }}>🎬</span>
                  <strong>Drop a video here or click to browse</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                    We read the real file: hook timing, loudness, silence, shot changes, resolution and bitrate.
                  </span>
                </div>
              )}
            </div>

            <div className="form-grid">
              <Field label="Target platform" htmlFor="platform">
                <Select id="platform" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}>
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram Reels</option>
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="x">X (Twitter)</option>
                  <option value="threads">Threads</option>
                  <option value="snapchat">Snapchat</option>
                  <option value="linkedin">LinkedIn</option>
                </Select>
              </Field>
              <Field label="Title" htmlFor="title">
                <Input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={140} />
              </Field>
              <Field label="What is the video about?" htmlFor="topic" hint="One line, used for tailored recommendations.">
                <Input id="topic" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} maxLength={140} placeholder="e.g. 3 desk setup upgrades under $50" />
              </Field>
              <Field label="Caption track" htmlFor="captions" hint="Burned-in or platform captions.">
                <Select id="captions" value={form.hasCaptions} onChange={(e) => setForm((f) => ({ ...f, hasCaptions: e.target.value }))}>
                  <option value="unknown">Not sure</option>
                  <option value="yes">Yes, captions burned in</option>
                  <option value="auto">Platform auto-captions only</option>
                  <option value="no">No captions</option>
                </Select>
              </Field>
              <Field label="Structure" htmlFor="structure" hint="Optional.">
                <Input id="structure" value={form.structure} onChange={(e) => setForm((f) => ({ ...f, structure: e.target.value }))} placeholder="tutorial, listicle, story…" maxLength={40} />
              </Field>
              <Field label="Ends with a call to action?" htmlFor="cta">
                <Select id="cta" value={form.hasCta} onChange={(e) => setForm((f) => ({ ...f, hasCta: e.target.value }))}>
                  <option value="">Not sure</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
              <Field label="Originality" htmlFor="originality">
                <Select id="originality" value={form.originality} onChange={(e) => setForm((f) => ({ ...f, originality: e.target.value }))}>
                  <option value="unknown">Not sure</option>
                  <option value="original">Original</option>
                  <option value="remix">Remix / reaction</option>
                  <option value="repost">Repost of someone else</option>
                </Select>
              </Field>
              <Field label="Audience retention %" htmlFor="retention" hint="From platform analytics, if you have it.">
                <Input id="retention" type="number" min="0" max="100" value={form.retentionPct} onChange={(e) => setForm((f) => ({ ...f, retentionPct: e.target.value }))} />
              </Field>
            </div>

            <details className="details-block">
              <summary>Already published? Add its real stats (optional)</summary>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <Field label="Views" htmlFor="views">
                  <Input id="views" type="number" min="0" value={form.views} onChange={(e) => setForm((f) => ({ ...f, views: e.target.value }))} />
                </Field>
                <Field label="Likes" htmlFor="likes">
                  <Input id="likes" type="number" min="0" value={form.likes} onChange={(e) => setForm((f) => ({ ...f, likes: e.target.value }))} />
                </Field>
                <Field label="Comments" htmlFor="comments">
                  <Input id="comments" type="number" min="0" value={form.comments} onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))} />
                </Field>
                <Field label="Shares" htmlFor="shares">
                  <Input id="shares" type="number" min="0" value={form.shares} onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))} />
                </Field>
                <Field label="Connected account" htmlFor="account">
                  <Select id="account" value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}>
                    <option value="">No account</option>
                    {state.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.platformName} @{account.handle}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            </details>

            <div className="row-between">
              <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>
                {limit ? `${Math.max(0, limit - used)} analyses left this month` : 'Unlimited analyses'}
              </span>
              <Button type="submit" variant="primary" loading={busy} disabled={!file}>
                {busy ? 'Uploading…' : 'Analyse video'}
              </Button>
            </div>
          </form>
        </Card>

        <div className="stack">
          <Card title="What gets measured" subtitle="Signals come from the file itself — no invented analytics.">
            <ul className="check-list">
              <li>Hook timing and how fast the first cut lands</li>
              <li>Loudness, peak level and silence ratio</li>
              <li>Shot changes per minute for pacing</li>
              <li>Resolution, aspect ratio, fps and bitrate</li>
              <li>Length against the platform's ideal window</li>
              <li>Captions, CTA and originality from your answers</li>
            </ul>
            <p style={{ color: 'var(--muted-2)', fontSize: 12, marginTop: 12 }}>
              Scores are an AI estimate of growth potential, not a guarantee of going viral.
            </p>
          </Card>
          <Card title="Your history" subtitle="Latest uploads first." action={<Button size="sm" variant="ghost" onClick={load}>Refresh</Button>}>
            {state.loading ? (
              <div className="stack" style={{ gap: 10 }}>
                <div className="skeleton" style={{ height: 52 }} />
                <div className="skeleton" style={{ height: 52 }} />
              </div>
            ) : state.videos.length === 0 ? (
              <EmptyState icon="📼" title="No uploads yet" text="Your analysed videos will be listed here." />
            ) : (
              <div className="stack" style={{ gap: 10 }}>
                {state.videos.slice(0, 6).map((video) => (
                  <Link key={video.id} to={`/app/studio/${video.id}`} className="history-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {video.title}
                      </strong>
                      <span style={{ color: 'var(--muted-2)', fontSize: 11.5 }}>
                        {video.platformName} · {fmtDuration(video.duration)} · {fmtDate(video.createdAt)}
                      </span>
                    </div>
                    <Badge tone={STATUS_TONE[video.status] || 'neutral'}>{STATUS_LABEL[video.status] || video.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card title="All videos" subtitle="Every upload with its current score.">
        {state.videos.length === 0 ? (
          <EmptyState icon="🎯" title="Nothing to show yet" text="Upload your first clip to build a scored library of content." />
        ) : (
          <div className="video-grid">
            {state.videos.map((video) => (
              <Link key={video.id} to={`/app/studio/${video.id}`} className="video-card">
                <div className="video-thumb">
                  {video.thumbUrl ? <img src={video.thumbUrl} alt="" loading="lazy" /> : <span>{video.overall ?? '—'}</span>}
                </div>
                <div className="video-body">
                  <strong style={{ display: 'block', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {video.title}
                  </strong>
                  <div className="video-meta">
                    <span>{video.platformName}</span>
                    <span>{fmtDuration(video.duration)}</span>
                    {video.reported?.views ? <span>{fmtNumber(video.reported.views)} views</span> : null}
                  </div>
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <Badge tone={STATUS_TONE[video.status] || 'neutral'}>{STATUS_LABEL[video.status] || video.status}</Badge>
                    {video.overall ? <Badge tone={video.overall >= 75 ? 'excellent' : video.overall >= 55 ? 'strong' : 'weak'}>{video.overall}/100</Badge> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
