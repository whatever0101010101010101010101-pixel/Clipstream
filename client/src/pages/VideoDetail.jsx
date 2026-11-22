import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, fmtDuration, fmtNumber, fmtPercent, SCORE_LABELS, scoreTone } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  InfoNote,
  Modal,
  ScoreBar,
  ScoreRing,
  Select,
  Skeleton,
} from '../ui.jsx';

const SCORE_ORDER = ['hook', 'editing', 'audio', 'quality', 'length', 'pacing', 'captions', 'storytelling', 'engagement', 'retention', 'originality'];
const PENDING = new Set(['queued', 'analyzing']);

const METRIC_ROWS = [
  ['duration', 'Duration', (v) => fmtDuration(v)],
  ['resolution', 'Resolution', null],
  ['aspect', 'Aspect ratio', (v) => v],
  ['orientation', 'Orientation', (v) => v],
  ['fps', 'Frame rate', (v) => `${Math.round(v)} fps`],
  ['bitrateKbps', 'Bitrate', (v) => `${Math.round(v)} kbps`],
  ['cuts', 'Shot changes', (v) => `${v}`],
  ['cutsPerMinute', 'Cuts per minute', (v) => `${v}`],
  ['meanVolume', 'Mean volume', (v) => `${v} dB`],
  ['maxVolume', 'Peak volume', (v) => `${v} dB`],
  ['silenceRatio', 'Silence', (v) => fmtPercent(v * 100)],
  ['audioCodec', 'Audio codec', (v) => v],
];

function findingTitle(finding) {
  return finding.title || finding.area || finding.label || finding.name || 'Finding';
}

function findingBody(finding) {
  return finding.detail || finding.message || finding.text || finding.summary || '';
}

function findingFix(finding) {
  return finding.fix || finding.action || finding.recommendation || finding.advice || '';
}

function ListOrText({ value }) {
  if (!value) return null;
  if (typeof value === 'string') return <p style={{ fontSize: 13.5, color: 'var(--text)' }}>{value}</p>;
  if (Array.isArray(value)) {
    return (
      <div className="tag-row">
        {value.map((item, index) => (
          <span key={index} className="chip">{typeof item === 'string' ? item : item.text || item.label || JSON.stringify(item)}</span>
        ))}
      </div>
    );
  }
  return null;
}

export default function VideoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [busy, setBusy] = useState('');
  const [actionError, setActionError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPlatform, setExportPlatform] = useState('tiktok');

  const load = useCallback(async () => {
    try {
      const data = await api(`/videos/${id}`);
      setState({ loading: false, error: '', data });
      return data;
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
      return null;
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const status = state.data?.video?.status;

  useEffect(() => {
    if (!status || !PENDING.has(status)) return undefined;
    const timer = setInterval(() => { load(); }, 2500);
    return () => clearInterval(timer);
  }, [status, load]);

  async function improve() {
    setBusy('improve');
    setActionError('');
    try {
      const result = await api(`/videos/${id}/improve`, { method: 'POST' });
      setState((s) => ({ ...s, data: { ...s.data, improvements: result.improvements, analysis: result.analysis || s.data.analysis } }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function reanalyze() {
    setBusy('reanalyze');
    setActionError('');
    try {
      await api(`/videos/${id}/analyze`, { method: 'POST' });
      await refresh();
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!window.confirm('Delete this video and its analysis? This cannot be undone.')) return;
    setBusy('delete');
    try {
      await api(`/videos/${id}`, { method: 'DELETE' });
      navigate('/app/studio');
    } catch (err) {
      setActionError(err.message);
      setBusy('');
    }
  }

  async function createExport() {
    setBusy('export');
    setActionError('');
    try {
      await api(`/videos/${id}/exports`, { method: 'POST', body: { platform: exportPlatform } });
      setExportOpen(false);
      await load();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy('');
    }
  }

  const data = state.data;
  const video = data?.video;
  const analysis = data?.analysis;
  const improvements = data?.improvements;
  const scores = analysis?.scores || video?.scores || null;
  const metrics = analysis?.metrics || null;
  const findings = analysis?.findings || [];

  const metricRows = useMemo(() => {
    if (!metrics) return [];
    const rows = [];
    METRIC_ROWS.forEach(([key, label, fmt]) => {
      const raw = metrics[key];
      if (raw === null || raw === undefined || raw === '') return;
      const value = fmt ? fmt(raw) : raw;
      if (value === null || value === undefined) return;
      rows.push([label, String(value)]);
    });
    if (metrics.width && metrics.height && !rows.some(([label]) => label === 'Resolution')) {
      rows.unshift(['Resolution', `${metrics.width}×${metrics.height}`]);
    }
    return rows;
  }, [metrics]);

  if (state.loading) {
    return (
      <div className="stack">
        <Skeleton height={40} width="40%" />
        <Skeleton height={280} />
        <div className="grid grid-2"><Skeleton height={220} /><Skeleton height={220} /></div>
      </div>
    );
  }

  if (state.error || !video) {
    return (
      <div className="stack">
        <ErrorBanner>{state.error || 'Video not found.'}</ErrorBanner>
        <div><Link to="/app/studio" className="btn btn-outline">Back to studio</Link></div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="row-between" style={{ alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Link to="/app/studio" className="card-link" style={{ fontSize: 12.5 }}>← Studio</Link>
          <h1 className="page-title" style={{ marginTop: 8 }}>{video.title}</h1>
          <p className="page-sub">
            {video.platformName} · uploaded {fmtDateTime(video.createdAt)} · {fmtDuration(video.duration)}
            {video.reported?.views ? ` · ${fmtNumber(video.reported.views)} views` : ''}
          </p>
        </div>
        <div className="page-actions">
          <Button variant="outline" loading={busy === 'reanalyze'} onClick={reanalyze}>Re-analyse</Button>
          <Button variant="primary" loading={busy === 'improve'} onClick={improve} disabled={!analysis}>
            Improve my video
          </Button>
          <Button variant="ghost" loading={busy === 'delete'} onClick={remove}>Delete</Button>
        </div>
      </div>

      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      {PENDING.has(video.status) ? (
        <Card>
          <div className="loading-block">
            <span className="spinner" />
            <div>
              <strong>{video.status === 'queued' ? 'Queued for analysis' : 'Analysing your video'}</strong>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                Measuring hook timing, loudness, silence, shot changes and encoding. This page updates automatically.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {video.status === 'error' ? (
        <ErrorBanner>
          {video.error || 'Analysis failed for this file.'} You can retry with “Re-analyse”, or upload a different clip.
        </ErrorBanner>
      ) : null}

      <div className="detail-grid">
        <Card title="Video" subtitle="Your uploaded file, streamed from this server.">
          <div className="player-wrap">
            <video controls preload="metadata" src={video.videoUrl} poster={video.thumbUrl || undefined} />
          </div>
          <div className="mini-stats" style={{ marginTop: 14 }}>
            <div className="mini-stat"><span>Views</span><strong>{fmtNumber(video.reported?.views)}</strong></div>
            <div className="mini-stat"><span>Likes</span><strong>{fmtNumber(video.reported?.likes)}</strong></div>
            <div className="mini-stat"><span>Comments</span><strong>{fmtNumber(video.reported?.comments)}</strong></div>
            <div className="mini-stat"><span>Shares</span><strong>{fmtNumber(video.reported?.shares)}</strong></div>
          </div>
        </Card>

        <Card title="Viral potential score" subtitle="AI estimate of growth potential — not a guarantee.">
          {scores ? (
            <div className="stack" style={{ gap: 16 }}>
              <div className="row" style={{ justifyContent: 'center' }}>
                <ScoreRing score={scores.overall} size={148} label="Overall" />
              </div>
              <div className="stack" style={{ gap: 12 }}>
                {SCORE_ORDER.filter((key) => scores[key] !== undefined).map((key) => (
                  <ScoreBar key={key} label={SCORE_LABELS[key] || key} value={scores[key]} />
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon="⏳" title="No scores yet" text="Scores appear as soon as the analysis finishes." />
          )}
        </Card>
      </div>

      {analysis?.summary ? (
        <Card title="Verdict" subtitle={`Source: ${analysis.source === 'llm' ? 'AI model + measured signals' : 'measured signals + rules'}`}>
          <p style={{ fontSize: 14.5, lineHeight: 1.65 }}>{analysis.summary}</p>
          {analysis.verdict ? <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>{analysis.verdict}</p> : null}
          <InfoNote tone="warn">
            This score is an AI estimate based on measured video signals and your inputs. It is not a prediction or a
            guarantee that a video will go viral.
          </InfoNote>
        </Card>
      ) : null}

      {findings.length ? (
        <Card title="What went wrong" subtitle="Ranked by impact on reach.">
          <div className="finding-list">
            {findings.map((finding, index) => (
              <div key={index} className="finding">
                <div className="finding-head">
                  <strong>{findingTitle(finding)}</strong>
                  {finding.severity ? (
                    <Badge tone={finding.severity === 'high' ? 'weak' : finding.severity === 'medium' ? 'fair' : 'info'}>
                      {finding.severity}
                    </Badge>
                  ) : null}
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>{findingBody(finding)}</p>
                {findingFix(finding) ? (
                  <p style={{ fontSize: 13.5, color: 'var(--text)', marginTop: 6 }}>
                    <strong style={{ color: 'var(--violet)' }}>Fix: </strong>
                    {findingFix(finding)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {improvements ? (
        <div className="stack">
          <Card title="Improvement plan" subtitle="Rebuilt hooks, titles, captions and packaging.">
            <div className="stack" style={{ gap: 22 }}>
              {improvements.hooks?.length ? (
                <div>
                  <h4 className="section-label">Better opening hooks</h4>
                  <div className="improve-list">
                    {improvements.hooks.map((hook, index) => (
                      <div key={index} className="improve-item">
                        <strong style={{ fontSize: 14 }}>“{hook.text}”</strong>
                        {hook.why ? <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>{hook.why}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {improvements.titles?.length ? (
                <div>
                  <h4 className="section-label">Trending-style titles</h4>
                  <div className="tag-row">
                    {improvements.titles.map((title, index) => (
                      <span key={index} className="chip">{typeof title === 'string' ? title : title.text}</span>
                    ))}
                  </div>
                </div>
              ) : null}

              {improvements.caption ? (
                <div>
                  <h4 className="section-label">Caption</h4>
                  <div className="output-box">{improvements.caption}</div>
                </div>
              ) : null}

              {improvements.hashtags?.length ? (
                <div>
                  <h4 className="section-label">Hashtags</h4>
                  <ListOrText value={improvements.hashtags} />
                </div>
              ) : null}

              {improvements.editing?.length ? (
                <div>
                  <h4 className="section-label">Editing fixes</h4>
                  <div className="stack" style={{ gap: 10 }}>
                    {improvements.editing.map((item, index) => (
                      <div key={index} className="insight-row">
                        <div>
                          <strong style={{ fontSize: 13.5 }}>{item.action || item.text}</strong>
                          {item.why ? <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>{item.why}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-2">
                {improvements.suggestedLength ? (
                  <div>
                    <h4 className="section-label">Suggested length</h4>
                    <p style={{ fontSize: 13.5 }}>{typeof improvements.suggestedLength === 'string' ? improvements.suggestedLength : `${improvements.suggestedLength.min}–${improvements.suggestedLength.max}s`}</p>
                  </div>
                ) : null}
                {improvements.packaging ? (
                  <div>
                    <h4 className="section-label">Packaging</h4>
                    <p style={{ fontSize: 13, color: 'var(--muted)' }}>{improvements.packaging.firstFrame}</p>
                    <p style={{ fontSize: 13, marginTop: 4 }}>{improvements.packaging.textOverlay}</p>
                  </div>
                ) : null}
              </div>

              {improvements.thumbnails?.length ? (
                <div>
                  <h4 className="section-label">Thumbnail concepts</h4>
                  <div className="stack" style={{ gap: 10 }}>
                    {improvements.thumbnails.map((thumb, index) => (
                      <div key={index} className="insight-row">
                        <div>
                          <strong style={{ fontSize: 13.5 }}>{thumb.concept}</strong>
                          {thumb.why ? <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 3 }}>{thumb.why}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {improvements.postingTimes?.length ? (
                <div>
                  <h4 className="section-label">Best posting windows</h4>
                  <div className="stack" style={{ gap: 8 }}>
                    {improvements.postingTimes.map((slot, index) => (
                      <div key={index} className="row-between" style={{ fontSize: 13 }}>
                        <span>{slot.window || slot.time}</span>
                        <span style={{ color: 'var(--muted-2)' }}>{slot.note || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {improvements.notes ? <InfoNote>{improvements.notes}</InfoNote> : null}
              <p style={{ color: 'var(--muted-2)', fontSize: 12 }}>
                {improvements.disclaimer || 'Recommendations are AI estimates, not guarantees of reach.'}
                {improvements.source ? ` Generated by ${improvements.source === 'llm' ? 'AI model' : 'rules engine'}.` : ''}
              </p>
            </div>
          </Card>
        </div>
      ) : (
        <Card title="Improvement plan" subtitle="Generate rewritten hooks, titles, captions and packaging.">
          <EmptyState
            icon="✨"
            title="No improvement plan yet"
            text="Press “Improve my video” to get a rewritten hook, captions, hashtags, editing fixes, thumbnail concepts and posting windows."
            action={<Button variant="primary" loading={busy === 'improve'} disabled={!analysis} onClick={improve}>Improve my video</Button>}
          />
        </Card>
      )}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card title="Measured signals" subtitle="Read directly from the file with ffprobe and ffmpeg.">
          {metricRows.length ? (
            <div className="metric-grid">
              {metricRows.map(([label, value]) => (
                <div key={label} className="metric-cell">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="🔍" title="No measurements yet" text="Signals appear once analysis completes." />
          )}
        </Card>

        <Card
          title="Platform versions"
          subtitle="Render a cut sized for each platform."
          action={<Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>Create version</Button>}
        >
          {data?.exports?.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {data.exports.map((item) => (
                <div key={item.id} className="row-between" style={{ fontSize: 13 }}>
                  <div>
                    <strong>{item.label}</strong>
                    <div style={{ color: 'var(--muted-2)', fontSize: 11.5 }}>{fmtDate(item.createdAt)}</div>
                  </div>
                  <a className="btn btn-ghost btn-sm" href={item.url}>Download</a>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon="✂️"
              title="No platform cuts yet"
              text="Generate a version trimmed to the platform's ideal length, ready to upload."
            />
          )}
        </Card>
      </div>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Create a platform version"
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy === 'export'} onClick={createExport}>Render version</Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            The clip is trimmed to that platform's ideal length and re-encoded. Rendering may take a few seconds.
          </p>
          <Select value={exportPlatform} onChange={(e) => setExportPlatform(e.target.value)} aria-label="Platform">
            <option value="tiktok">TikTok (9:16, ~30s)</option>
            <option value="instagram">Instagram Reels (9:16)</option>
            <option value="youtube">YouTube</option>
            <option value="facebook">Facebook</option>
            <option value="x">X (Twitter)</option>
          </Select>
          {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
        </div>
      </Modal>
    </div>
  );
}
