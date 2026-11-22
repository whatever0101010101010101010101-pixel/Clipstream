import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, fmtNumber, fmtPercent, SCORE_LABELS } from '../api.js';
import { useAuth } from '../auth.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  InfoNote,
  Progress,
  ScoreBar,
  Skeleton,
  Stat,
} from '../ui.jsx';

const SCORE_ORDER = ['hook', 'editing', 'audio', 'engagement', 'retention', 'overall'];

function AreaChart({ series, height = 190 }) {
  const [hover, setHover] = useState(null);
  const width = 720;
  const pad = { top: 14, right: 8, bottom: 22, left: 8 };
  const points = series.length ? series : [];
  const max = Math.max(1, ...points.map((p) => p.views || 0));

  const coords = points.map((p, i) => {
    const x = pad.left + (i / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
    const y = pad.top + (1 - (p.views || 0) / max) * (height - pad.top - pad.bottom);
    return { x, y, ...p };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = coords.length
    ? `${line} L${coords[coords.length - 1].x.toFixed(1)},${height - pad.bottom} L${coords[0].x.toFixed(1)},${height - pad.bottom} Z`
    : '';

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Views over the last 30 days">
        <defs>
          <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="viewsLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="60%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={pad.left}
            x2={width - pad.right}
            y1={pad.top + t * (height - pad.top - pad.bottom)}
            y2={pad.top + t * (height - pad.top - pad.bottom)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        ))}
        {area ? <path d={area} fill="url(#viewsFill)" /> : null}
        {line ? <path d={line} fill="none" stroke="url(#viewsLine)" strokeWidth="2.5" strokeLinecap="round" /> : null}
        {coords.map((c, i) => (
          <g key={`${c.date}-${i}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r={hover === i ? 5 : 0}
              fill="#fff"
              stroke="#8b5cf6"
              strokeWidth="2"
            />
            <rect
              x={c.x - 8}
              y={pad.top}
              width={16}
              height={height - pad.top - pad.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && coords[hover] ? (
        <div className="chart-tooltip">
          <strong>{fmtNumber(coords[hover].views)}</strong> views
          <span>{fmtDate(coords[hover].date)}</span>
        </div>
      ) : null}
      <div className="chart-axis">
        <span>{points.length ? fmtDate(points[0].date) : ''}</span>
        <span>{points.length ? fmtDate(points[points.length - 1].date) : ''}</span>
      </div>
    </div>
  );
}

function PlatformBars({ platforms }) {
  const max = Math.max(1, ...platforms.map((p) => p.views || 0));
  return (
    <div className="stack" style={{ gap: 14 }}>
      {platforms.map((p) => (
        <div key={p.platform}>
          <div className="row-between" style={{ marginBottom: 6, fontSize: 13 }}>
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span className="status-dot" style={{ background: p.accent }} />
              {p.name}
            </span>
            <span style={{ color: 'var(--muted)' }}>
              {fmtNumber(p.views)} views · {p.analyses} analysed
            </span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.round(((p.views || 0) / max) * 100)}%`, background: p.accent || 'var(--violet)' }}
            />
          </div>
          <div className="row-between" style={{ marginTop: 4, fontSize: 11.5, color: 'var(--muted-2)' }}>
            <span>{fmtPercent(p.engagementRate)} engagement</span>
            <span>{p.avgScore ? `Avg score ${p.avgScore}` : 'No analyses yet'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { plan, usage, user } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [demoBusy, setDemoBusy] = useState(false);

  async function load() {
    try {
      const data = await api('/insights/dashboard');
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleDemo(mode) {
    setDemoBusy(true);
    try {
      if (mode === 'add') await api('/metrics/sample', { method: 'POST' });
      else await api('/metrics/sample', { method: 'DELETE' });
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setDemoBusy(false);
    }
  }

  const data = state.data;
  const totals = data?.totals || {};
  const series = useMemo(() => (data?.series || []).filter((p) => p.views > 0 || p.followers > 0), [data]);
  const used = usage?.used ?? totals.analyses ?? 0;
  const limit = usage?.limit ?? plan?.analysesPerMonth ?? 0;

  if (state.loading) {
    return (
      <div className="stack">
        <div className="page-head"><h1 className="page-title">Dashboard</h1></div>
        <div className="grid grid-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} />)}
        </div>
        <Skeleton height={260} />
        <div className="grid grid-2"><Skeleton height={240} /><Skeleton height={240} /></div>
      </div>
    );
  }

  if (state.error && !data) {
    return (
      <div className="stack">
        <ErrorBanner>{state.error}</ErrorBanner>
        <div><Button onClick={load}>Try again</Button></div>
      </div>
    );
  }

  const hasData = series.length > 0 || (totals.analyses || 0) > 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Welcome back, {String(user?.name || 'creator').split(' ')[0]}</h1>
          <p className="page-sub">
            {hasData
              ? 'Measured performance across your connected accounts and analysed videos.'
              : 'Start by uploading a video — every score comes from measured video signals.'}
          </p>
        </div>
        <div className="page-actions">
          <Link to="/app/studio" className="btn btn-primary">Upload a video</Link>
          <Link to="/app/accounts" className="btn btn-outline">Connect accounts</Link>
        </div>
      </div>

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <div className="grid grid-4">
        <Stat label="Total views" value={fmtNumber(totals.views)} hint="Sum of imported and synced metrics" />
        <Stat
          label="Followers"
          value={fmtNumber(totals.followers)}
          hint="Latest count per account"
          delta={totals.weeklyFollowerChange ? `${totals.weeklyFollowerChange > 0 ? '+' : ''}${fmtNumber(totals.weeklyFollowerChange)} this week` : null}
        />
        <Stat label="Engagement rate" value={fmtPercent(totals.engagementRate)} hint="Likes + comments + shares ÷ views" />
        <Stat
          label="Avg content score"
          value={totals.averageScore ? `${totals.averageScore}/100` : '—'}
          hint={`${totals.analyses || 0} analyses · ${totals.videos || 0} videos`}
        />
      </div>

      <Card
        title="Growth over the last 30 days"
        subtitle="Daily views from your connected accounts and imported metrics."
        action={<Badge tone="info">Views</Badge>}
      >
        {series.length ? (
          <AreaChart series={series} />
        ) : (
          <EmptyState
            icon="📈"
            title="No performance data yet"
            text="Connect an account, import a CSV export, or load demo data to see how the charts behave."
            action={
              <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
                <Button variant="primary" loading={demoBusy} onClick={() => toggleDemo('add')}>Load demo data</Button>
                <Link to="/app/accounts" className="btn btn-outline">Connect account</Link>
              </div>
            }
          />
        )}
        {data?.hasSampleData ? (
          <div className="row-between" style={{ marginTop: 12 }}>
            <InfoNote>Demo data is loaded so you can explore the dashboard. Remove it anytime.</InfoNote>
            <Button size="sm" variant="ghost" loading={demoBusy} onClick={() => toggleDemo('remove')}>Remove demo data</Button>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card
          title="Platform comparison"
          subtitle="Views, engagement and average score by platform."
          action={<Link to="/app/accounts" className="card-link">Manage</Link>}
        >
          {data?.platforms?.length ? (
            <PlatformBars platforms={data.platforms} />
          ) : (
            <EmptyState icon="🔗" title="No platforms connected" text="Add a TikTok, Instagram, YouTube, Facebook or X account to compare performance." />
          )}
        </Card>

        <Card title="Where you lose viewers" subtitle="Weakest measured areas across your analysed videos.">
          {data?.weakestAreas?.length ? (
            <div className="stack" style={{ gap: 14 }}>
              {data.weakestAreas.map((area) => (
                <ScoreBar
                  key={area.key}
                  label={SCORE_LABELS[area.key] || area.key}
                  value={area.score}
                  hint={area.hint}
                />
              ))}
              <Link to="/app/studio" className="btn btn-outline btn-block">Analyse another video</Link>
            </div>
          ) : (
            <EmptyState icon="🎯" title="Nothing measured yet" text="Upload a video and the weakest areas will show up here with fixes." />
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card
          title="Best performing videos"
          subtitle="Ranked by content score, then reported views."
          action={<Link to="/app/studio" className="card-link">Studio</Link>}
        >
          {data?.bestVideos?.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {data.bestVideos.map((video) => (
                <Link key={video.id} to={`/app/studio/${video.id}`} className="history-item">
                  <div className="video-thumb" style={{ width: 56, height: 56, borderRadius: 12 }}>
                    {video.thumbUrl ? <img src={video.thumbUrl} alt="" /> : <span>{video.overall}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="video-meta" style={{ marginTop: 0 }}>
                      <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {video.title}
                      </strong>
                      <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>
                        {video.platformName} · {fmtNumber(video.views)} views · {fmtDate(video.createdAt)}
                      </span>
                    </div>
                  </div>
                  <Badge tone={video.overall >= 75 ? 'excellent' : video.overall >= 55 ? 'strong' : 'weak'}>
                    {video.overall}/100
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="🏆" title="No analysed videos yet" text="Your best performing content appears here once you analyse your first video." />
          )}
        </Card>

        <Card title="Recent analyses" subtitle="The latest reports you generated." action={<Link to="/app/studio" className="card-link">All videos</Link>}>
          {data?.recentAnalyses?.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {data.recentAnalyses.map((item) => (
                <Link key={item.id} to={`/app/studio/${item.videoId}`} className="history-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </strong>
                    <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>
                      {item.platformName} · {fmtDate(item.createdAt)}
                    </span>
                  </div>
                  <Badge tone="info">{item.scores?.overall ?? '—'}/100</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="🧠" title="No reports yet" text="Upload a video to get hook, pacing, audio and retention scores with a fix list." />
          )}
        </Card>
      </div>

      <Card title="Monthly analysis allowance" subtitle={`${plan?.name || 'Free'} plan`} action={<Link to="/app/billing" className="card-link">Change plan</Link>}>
        <div className="row-between" style={{ marginBottom: 10, fontSize: 13 }}>
          <span style={{ color: 'var(--muted)' }}>{used} of {limit || '∞'} analyses used this month</span>
          <Badge tone={limit && used >= limit ? 'weak' : 'strong'}>{limit ? Math.max(0, limit - used) : '∞'} left</Badge>
        </div>
        <Progress value={limit ? (used / limit) * 100 : 0} />
        {data?.disclaimer ? <p style={{ color: 'var(--muted-2)', fontSize: 12, marginTop: 12 }}>{data.disclaimer}</p> : null}
      </Card>
    </div>
  );
}
