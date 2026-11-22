import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { platformById, planFor } from '../lib/plans.js';
import { nowIso, parseNum, round, safeText, uuid } from '../lib/util.js';
import { usageFor } from '../lib/usage.js';
import { fetchChannel, fetchRecentVideos, youtubeConfigured } from '../lib/youtube.js';

const router = Router();

const sum = (rows, key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
const avg = (rows, key) => (rows.length ? sum(rows, key) / rows.length : 0);

function dashboardData(user) {
  const accounts = all('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC', [user.id]);
  const metrics = all('SELECT * FROM metrics WHERE user_id = ? ORDER BY date ASC', [user.id]);
  const videos = all('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC', [user.id]);
  const analyses = all(
    `SELECT a.*, v.title, v.platform, v.duration FROM analyses a JOIN videos v ON v.id = a.video_id
     WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 60`,
    [user.id],
  ).map((row) => ({
    id: row.id,
    videoId: row.video_id,
    title: row.title,
    platform: row.platform,
    createdAt: row.created_at,
    summary: row.summary,
    scores: JSON.parse(row.scores_json || '{}'),
  }));

  const followerByAccount = new Map();
  for (const m of metrics) {
    if (Number(m.followers) > 0) followerByAccount.set(m.account_id, Number(m.followers));
  }
  for (const account of accounts) {
    if (!followerByAccount.has(account.id) && Number(account.followers) > 0) {
      followerByAccount.set(account.id, Number(account.followers));
    }
  }
  const followers = [...followerByAccount.values()].reduce((a, b) => a + b, 0);

  const reportedViews = sum(videos, 'reported_views');
  const views = sum(metrics, 'views') + reportedViews;
  const likes = sum(metrics, 'likes') + sum(videos, 'reported_likes');
  const comments = sum(metrics, 'comments') + sum(videos, 'reported_comments');
  const shares = sum(metrics, 'shares') + sum(videos, 'reported_shares');
  const engagementRate = views > 0 ? round(((likes + comments + shares) / views) * 100, 2) : 0;

  // Daily series with running follower totals.
  const byDate = new Map();
  const running = new Map();
  for (const m of metrics) {
    if (!byDate.has(m.date)) byDate.set(m.date, { date: m.date, views: 0, likes: 0, comments: 0, shares: 0, followers: 0 });
    const day = byDate.get(m.date);
    day.views += Number(m.views) || 0;
    day.likes += Number(m.likes) || 0;
    day.comments += Number(m.comments) || 0;
    day.shares += Number(m.shares) || 0;
    if (Number(m.followers) > 0) running.set(m.account_id, Number(m.followers));
    day.followers = [...running.values()].reduce((a, b) => a + b, 0);
  }
  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);

  const weeklyFollowerChange = (() => {
    if (series.length < 2) return 0;
    const last = series[series.length - 1].followers;
    const weekAgo = series[Math.max(0, series.length - 8)].followers;
    return last - weekAgo;
  })();

  const platformMap = new Map();
  const ensure = (id) => {
    if (!platformMap.has(id)) {
      platformMap.set(id, {
        platform: id,
        name: platformById(id).name,
        accent: platformById(id).accent,
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        followers: 0,
        analyses: 0,
        scoreSum: 0,
      });
    }
    return platformMap.get(id);
  };
  for (const m of metrics) {
    const account = accounts.find((a) => a.id === m.account_id);
    if (!account) continue;
    const entry = ensure(account.platform);
    entry.views += Number(m.views) || 0;
    entry.likes += Number(m.likes) || 0;
    entry.comments += Number(m.comments) || 0;
    entry.shares += Number(m.shares) || 0;
    entry.followers = Math.max(entry.followers, Number(m.followers) || 0);
  }
  for (const a of analyses) {
    const entry = ensure(a.platform);
    entry.analyses += 1;
    entry.scoreSum += Number(a.scores.overall) || 0;
  }
  const platforms = [...platformMap.values()]
    .map((p) => ({
      ...p,
      engagementRate: p.views ? round(((p.likes + p.comments + p.shares) / p.views) * 100, 2) : 0,
      avgScore: p.analyses ? Math.round(p.scoreSum / p.analyses) : null,
    }))
    .sort((a, b) => b.views - a.views);

  const bestVideos = videos
    .map((v) => {
      const analysis = analyses.find((a) => a.videoId === v.id);
      return analysis
        ? {
            id: v.id,
            title: v.title,
            platform: v.platform,
            platformName: platformById(v.platform).name,
            overall: analysis.scores.overall,
            scores: analysis.scores,
            views: v.reported_views,
            likes: v.reported_likes,
            createdAt: v.created_at,
            thumbUrl: v.thumb_path ? `/api/videos/${v.id}/thumb` : null,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => (b.overall - a.overall) || (b.views - a.views))
    .slice(0, 5);

  const scoreKeys = ['hook', 'editing', 'audio', 'quality', 'captions', 'pacing', 'storytelling', 'engagement', 'retention', 'length', 'originality'];
  const scoreAverages = {};
  for (const key of scoreKeys) {
    const values = analyses.map((a) => Number(a.scores[key])).filter((n) => Number.isFinite(n));
    scoreAverages[key] = values.length ? Math.round(values.reduce((x, y) => x + y, 0) / values.length) : null;
  }
  const ranked = scoreKeys
    .filter((k) => scoreAverages[k] !== null)
    .sort((a, b) => scoreAverages[a] - scoreAverages[b]);

  return {
    totals: {
      views,
      followers,
      likes,
      comments,
      shares,
      engagementRate,
      weeklyFollowerChange,
      averageScore: analyses.length
        ? Math.round(analyses.reduce((acc, a) => acc + (Number(a.scores.overall) || 0), 0) / analyses.length)
        : null,
      videos: videos.length,
      analyses: analyses.length,
      accounts: accounts.length,
    },
    series,
    platforms,
    bestVideos,
    recentAnalyses: analyses.slice(0, 6),
    weakestAreas: ranked.slice(0, 3).map((k) => ({ key: k, score: scoreAverages[k] })),
    strongestAreas: ranked.slice(-2).reverse().map((k) => ({ key: k, score: scoreAverages[k] })),
    hasSampleData: metrics.some((m) => m.is_sample === 1),
    usage: usageFor(user),
    disclaimer:
      'Dashboard numbers come from the metrics you import or record and the stats you attach to uploads. Nothing here is scraped or invented by INFLUENCER.',
  };
}

router.get('/dashboard', requireAuth, (req, res) => {
  res.json(dashboardData(req.user));
});

/* ------------------------------ Competitors ----------------------------- */

const publicEngagement = (posts) => {
  const views = sum(posts, 'views');
  const interactions = sum(posts, 'likes') + sum(posts, 'comments') + sum(posts, 'shares');
  return { views, interactions, engagementRate: views ? round((interactions / views) * 100, 2) : 0 };
};

function summarize(competitor, posts) {
  const sorted = [...posts].sort((a, b) => String(a.posted_at).localeCompare(String(b.posted_at)));
  const totals = publicEngagement(sorted);
  const formats = {};
  const topics = {};
  for (const post of sorted) {
    const f = post.format || 'unspecified';
    formats[f] = (formats[f] || 0) + 1;
    if (post.topic) {
      const t = post.topic.toLowerCase();
      topics[t] = (topics[t] || 0) + 1;
    }
  }
  const spanDays = sorted.length > 1
    ? Math.max(1, (new Date(sorted[sorted.length - 1].posted_at) - new Date(sorted[0].posted_at)) / 864e5)
    : null;
  const best = [...sorted].sort((a, b) => {
    const ea = a.views ? (Number(a.likes) + Number(a.comments) + Number(a.shares)) / Number(a.views) : 0;
    const eb = b.views ? (Number(b.likes) + Number(b.comments) + Number(b.shares)) / Number(b.views) : 0;
    return eb - ea;
  })[0];
  return {
    ...competitor,
    platformName: platformById(competitor.platform).name,
    accent: platformById(competitor.platform).accent,
    posts: sorted.length,
    totalViews: totals.views,
    totalInteractions: totals.interactions,
    avgViews: sorted.length ? Math.round(totals.views / sorted.length) : 0,
    engagementRate: totals.engagementRate,
    postsPerWeek: spanDays ? round((sorted.length / spanDays) * 7, 1) : null,
    formats: Object.entries(formats).sort((a, b) => b[1] - a[1]).map(([format, count]) => ({ format, count })),
    topics: Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count })),
    bestPost: best
      ? { title: best.title, url: best.url, views: best.views, likes: best.likes, postedAt: best.posted_at }
      : null,
    lastSyncedAt: competitor.last_synced_at,
  };
}

router.get('/competitors', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM competitors WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
  const competitors = rows.map((row) =>
    summarize(row, all('SELECT * FROM competitor_posts WHERE competitor_id = ? AND user_id = ?', [row.id, req.user.id])),
  );
  res.json({ competitors, usage: usageFor(req.user) });
});

router.post('/competitors', requireAuth, (req, res) => {
  const plan = planFor(req.user.plan);
  const count = get('SELECT COUNT(*) AS n FROM competitors WHERE user_id = ?', [req.user.id]);
  if (Number(count?.n || 0) >= plan.competitorSlots) {
    return res.status(402).json({
      error: `The ${plan.name} plan tracks ${plan.competitorSlots} competitor${plan.competitorSlots === 1 ? '' : 's'}. Upgrade to track more.`,
      code: 'PLAN_LIMIT',
    });
  }
  const platform = safeText(req.body?.platform, 30);
  const handle = safeText(req.body?.handle, 80).replace(/^@/, '');
  const name = safeText(req.body?.name, 120) || handle;
  const niche = safeText(req.body?.niche, 120);
  if (!handle || handle.length < 2) return res.status(400).json({ error: 'Enter the public competitor handle.' });
  if (!['tiktok', 'instagram', 'youtube', 'facebook', 'x', 'threads', 'snapchat', 'linkedin'].includes(platform)) {
    return res.status(400).json({ error: 'Choose a supported platform.' });
  }
  const id = uuid();
  run(
    'INSERT INTO competitors (id, user_id, platform, handle, name, niche, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.id, platform, handle, name, niche || null, nowIso()],
  );
  res.status(201).json({
    competitor: summarize(get('SELECT * FROM competitors WHERE id = ?', [id]), []),
    note: 'Only public posts you add are stored. No private account data is accessed.',
  });
});

router.post('/competitors/:id/posts', requireAuth, (req, res) => {
  const competitor = get('SELECT * FROM competitors WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!competitor) return res.status(404).json({ error: 'Competitor not found.' });
  const title = safeText(req.body?.title, 200);
  if (!title) return res.status(400).json({ error: 'Add a short label for the public post.' });
  const url = safeText(req.body?.url, 500);
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Post URL must start with http:// or https://' });
  const postedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.postedAt || ''))
    ? req.body.postedAt
    : new Date().toISOString().slice(0, 10);
  run(
    `INSERT INTO competitor_posts (id, competitor_id, user_id, title, url, posted_at, views, likes, comments, shares, format, topic, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      competitor.id,
      req.user.id,
      title,
      url || null,
      postedAt,
      Math.max(0, Math.round(parseNum(req.body?.views, 0))),
      Math.max(0, Math.round(parseNum(req.body?.likes, 0))),
      Math.max(0, Math.round(parseNum(req.body?.comments, 0))),
      Math.max(0, Math.round(parseNum(req.body?.shares, 0))),
      safeText(req.body?.format, 40) || 'short-form',
      safeText(req.body?.topic, 80) || null,
      nowIso(),
    ],
  );
  const posts = all('SELECT * FROM competitor_posts WHERE competitor_id = ? AND user_id = ?', [competitor.id, req.user.id]);
  res.status(201).json({ competitor: summarize(competitor, posts) });
});

router.post('/competitors/:id/sync', requireAuth, async (req, res) => {
  const competitor = get('SELECT * FROM competitors WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!competitor) return res.status(404).json({ error: 'Competitor not found.' });
  if (competitor.platform !== 'youtube') {
    return res.status(400).json({
      error: 'Automated public sync is only available for YouTube in this build. For other platforms add public posts manually — private data is never accessed.',
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
  }
  if (!youtubeConfigured()) {
    return res.status(400).json({
      error: 'YouTube public sync needs a YOUTUBE_API_KEY environment variable. Add it in Settings → Environment variables, then try again.',
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
  }
  const channel = await fetchChannel(competitor.handle);
  if (!channel) return res.status(404).json({ error: 'That public YouTube channel could not be found.' });
  const videos = await fetchRecentVideos(channel.uploadsPlaylistId, 12);
  let added = 0;
  for (const video of videos) {
    const exists = get('SELECT id FROM competitor_posts WHERE competitor_id = ? AND url = ?', [competitor.id, video.url]);
    if (exists) continue;
    run(
      `INSERT INTO competitor_posts (id, competitor_id, user_id, title, url, posted_at, views, likes, comments, shares, format, topic, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'long-form', NULL, ?)`,
      [uuid(), competitor.id, req.user.id, video.title, video.url, video.publishedAt, video.views, video.likes, video.comments, nowIso()],
    );
    added += 1;
  }
  run('UPDATE competitors SET last_synced_at = ?, name = COALESCE(?, name) WHERE id = ?', [nowIso(), channel.title, competitor.id]);
  const posts = all('SELECT * FROM competitor_posts WHERE competitor_id = ? AND user_id = ?', [competitor.id, req.user.id]);
  res.json({
    competitor: summarize(get('SELECT * FROM competitors WHERE id = ?', [competitor.id]), posts),
    added,
    source: 'youtube_data_api',
    note: 'Synced public video statistics from the official YouTube Data API. Subscriber counts and private insights are not exposed by this endpoint.',
  });
});

router.delete('/competitors/:id', requireAuth, (req, res) => {
  const competitor = get('SELECT * FROM competitors WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!competitor) return res.status(404).json({ error: 'Competitor not found.' });
  run('DELETE FROM competitor_posts WHERE competitor_id = ? AND user_id = ?', [competitor.id, req.user.id]);
  run('DELETE FROM competitors WHERE id = ?', [competitor.id]);
  res.json({ ok: true });
});

router.get('/competitors/analysis', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM competitors WHERE user_id = ?', [req.user.id]);
  const competitors = rows.map((row) =>
    summarize(row, all('SELECT * FROM competitor_posts WHERE competitor_id = ? AND user_id = ?', [row.id, req.user.id])),
  );
  const posts = competitors.flatMap((c) =>
    all('SELECT * FROM competitor_posts WHERE competitor_id = ? AND user_id = ?', [c.id, req.user.id]),
  );
  const userVideos = all('SELECT * FROM videos WHERE user_id = ?', [req.user.id]);
  const userAnalyses = all(
    'SELECT scores_json FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
    [req.user.id],
  );
  const ownAvgViews = userVideos.filter((v) => v.reported_views > 0);
  const ownEngagement = (() => {
    const views = sum(ownAvgViews, 'reported_views');
    const interactions = sum(ownAvgViews, 'reported_likes') + sum(ownAvgViews, 'reported_comments') + sum(ownAvgViews, 'reported_shares');
    return views ? round((interactions / views) * 100, 2) : null;
  })();
  const competitorAvgViews = posts.length ? Math.round(sum(posts, 'views') / posts.length) : null;
  const competitorEngagement = publicEngagement(posts).engagementRate || null;
  const formatCounts = {};
  const topicCounts = {};
  for (const post of posts) {
    const f = post.format || 'unspecified';
    formatCounts[f] = (formatCounts[f] || 0) + 1;
    if (post.topic) topicCounts[post.topic.toLowerCase()] = (topicCounts[post.topic.toLowerCase()] || 0) + 1;
  }
  const dominantFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dominantTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const ownUploadsLast30 = userVideos.filter((v) => Date.now() - new Date(v.created_at).getTime() < 30 * 864e5).length;

  const insights = [];
  if (competitorAvgViews !== null) {
    insights.push({
      area: 'Reach per post',
      tone: competitorAvgViews > 0 ? 'benchmark' : 'neutral',
      detail: `Tracked competitors average ${competitorAvgViews.toLocaleString()} public views per post across ${posts.length} logged posts.`,
      action: 'Use their best-performing format as a reference point, not a target to copy. Rebuild the idea with your own hook and examples.',
    });
  }
  if (competitorEngagement !== null) {
    insights.push({
      area: 'Public engagement rate',
      tone: ownEngagement === null ? 'neutral' : competitorEngagement > ownEngagement ? 'behind' : 'ahead',
      detail:
        ownEngagement === null
          ? `Competitors convert ${competitorEngagement}% of public views into likes, comments and shares. Add your own reported stats to compare.`
          : `Competitors convert ${competitorEngagement}% of views into interactions; your reported content converts ${ownEngagement}%.`,
      action:
        ownEngagement !== null && competitorEngagement > ownEngagement
          ? 'Ask one specific question in the last 3 seconds of the video to lift comments.'
          : 'Keep the current CTA style and test it on your next upload.',
    });
  }
  if (dominantFormat) {
    insights.push({
      area: 'Content formats',
      tone: 'benchmark',
      detail: `Their most frequent public format is "${dominantFormat}" (${formatCounts[dominantFormat]} of ${posts.length} posts).`,
      action: 'Produce two variations in that format this month and compare retention against your usual style.',
    });
  }
  if (dominantTopic) {
    insights.push({
      area: 'Content topics',
      tone: 'benchmark',
      detail: `The most repeated public topic is "${dominantTopic}".`,
      action: 'Find the sub-angle they have not covered and own that instead of repeating the same take.',
    });
  }
  insights.push({
    area: 'Posting frequency',
    tone: 'neutral',
    detail: `You uploaded ${ownUploadsLast30} video${ownUploadsLast30 === 1 ? '' : 's'} for analysis in the last 30 days; competitors logged ${
      posts.filter((p) => Date.now() - new Date(p.posted_at).getTime() < 30 * 864e5).length
    } public posts in the same window.`,
    action: 'Consistency beats volume: pick a cadence you can sustain for 8 weeks before increasing it.',
  });

  const scoreAverages = userAnalyses.length
    ? userAnalyses
        .map((row) => JSON.parse(row.scores_json || '{}'))
        .reduce((acc, s) => {
          const keys = ['hook', 'editing', 'audio', 'captions', 'pacing', 'engagement', 'retention'];
          keys.forEach((k) => {
            acc[k] = (acc[k] || 0) + (Number(s[k]) || 0);
          });
          acc.count += 1;
          return acc;
        }, { count: 0 })
    : null;

  res.json({
    competitors: competitors.length,
    postsTracked: posts.length,
    benchmarks: {
      competitorAvgViews,
      competitorEngagement,
      dominantFormat,
      dominantTopic,
      ownEngagement,
      ownUploadsLast30,
      ownAvgScore: scoreAverages ? Math.round(Object.keys(scoreAverages).filter((k) => k !== 'count').reduce((acc, k) => acc + scoreAverages[k] / scoreAverages.count, 0) / 7) : null,
    },
    insights,
    disclaimer:
      'Competitor analysis uses only public posts and figures you record. Private accounts, DMs and non-public insights are never accessed.',
  });
});

export default router;
