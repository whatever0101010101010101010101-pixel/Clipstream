import { Router } from 'express';
import { all, get, run, transaction } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { PLATFORMS, integrationStatus, platformById, planFor } from '../lib/plans.js';
import { nowIso, parseNum, safeText, uuid } from '../lib/util.js';
import { fetchChannel, youtubeConfigured } from '../lib/youtube.js';
import { usageFor } from '../lib/usage.js';

const router = Router();

const platformIds = new Set(PLATFORMS.map((p) => p.id));
const today = () => new Date().toISOString().slice(0, 10);
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

router.get('/platforms', (req, res) => {
  res.json({
    platforms: PLATFORMS.map((p) => ({
      id: p.id,
      name: p.name,
      accent: p.accent,
      idealLength: p.idealLength,
      postingWindows: p.postingWindows,
      integration: integrationStatus(p),
    })),
    llm: { configured: Boolean(process.env.OPENAI_API_KEY) },
    payments: { configured: Boolean(process.env.STRIPE_SECRET_KEY) },
    youtubeApi: { configured: youtubeConfigured() },
  });
});

router.get('/accounts', requireAuth, (req, res) => {
  const accounts = all('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC', [req.user.id]);
  const enriched = accounts.map((account) => {
    const latest = get(
      'SELECT * FROM metrics WHERE user_id = ? AND account_id = ? ORDER BY date DESC LIMIT 1',
      [req.user.id, account.id],
    );
    const counts = get(
      'SELECT COUNT(*) AS videos, COALESCE(AVG(a.scores_json IS NULL), 0) AS x FROM videos v LEFT JOIN analyses a ON a.video_id = v.id WHERE v.user_id = ? AND v.account_id = ?',
      [req.user.id, account.id],
    );
    const analysisStats = get(
      `SELECT COUNT(*) AS n FROM analyses a JOIN videos v ON v.id = a.video_id
       WHERE a.user_id = ? AND v.account_id = ?`,
      [req.user.id, account.id],
    );
    return {
      id: account.id,
      platform: account.platform,
      platformName: platformById(account.platform).name,
      accent: platformById(account.platform).accent,
      handle: account.handle,
      profileUrl: account.profile_url,
      connectionType: account.connection_type,
      followers: latest?.followers || account.followers || 0,
      verified: Boolean(account.verified),
      notes: account.notes,
      lastSyncedAt: account.last_synced_at,
      createdAt: account.created_at,
      videos: Number(counts?.videos || 0),
      analyses: Number(analysisStats?.n || 0),
    };
  });
  res.json({
    accounts: enriched,
    usage: usageFor(req.user),
    platforms: PLATFORMS.map((p) => ({ id: p.id, name: p.name, accent: p.accent, integration: integrationStatus(p) })),
  });
});

router.post('/accounts', requireAuth, (req, res) => {
  const platform = safeText(req.body?.platform, 30);
  const handle = safeText(req.body?.handle, 80).replace(/^@/, '');
  const profileUrl = safeText(req.body?.profileUrl, 300);
  const followers = Math.max(0, Math.round(parseNum(req.body?.followers, 0)));
  const notes = safeText(req.body?.notes, 300);

  if (!platformIds.has(platform)) return res.status(400).json({ error: 'Choose a supported platform.' });
  if (handle.length < 2) return res.status(400).json({ error: 'Enter the account handle (at least 2 characters).' });
  if (profileUrl && !/^https?:\/\//i.test(profileUrl)) {
    return res.status(400).json({ error: 'Profile URL must start with http:// or https://' });
  }
  if (get('SELECT id FROM accounts WHERE user_id = ? AND platform = ? AND lower(handle) = lower(?)', [req.user.id, platform, handle])) {
    return res.status(409).json({ error: 'That account is already connected.' });
  }

  const info = integrationStatus(platformById(platform));
  const id = uuid();
  run(
    `INSERT INTO accounts (id, user_id, platform, handle, profile_url, connection_type, followers, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.id, platform, handle, profileUrl || null, info.configured ? 'api-ready' : 'manual', followers, notes || null, nowIso()],
  );
  if (followers > 0) {
    run(
      'INSERT INTO metrics (id, user_id, account_id, date, views, followers, likes, comments, shares, source, is_sample, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, 0, 0, ?, 0, ?)',
      [uuid(), req.user.id, id, today(), followers, 'manual', nowIso()],
    );
  }
  res.status(201).json({
    account: get('SELECT * FROM accounts WHERE id = ?', [id]),
    notice: info.configured
      ? 'Account added. API credentials detected — use Sync to pull public stats.'
      : 'Account connected in manual mode. Official API credentials are not configured on this deployment, so stats come from your imports and uploads.',
  });
});

router.patch('/accounts/:id', requireAuth, (req, res) => {
  const account = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const handle = safeText(req.body?.handle, 80).replace(/^@/, '') || account.handle;
  const profileUrl = safeText(req.body?.profileUrl, 300) || account.profile_url;
  const followers = req.body?.followers === undefined ? null : Math.max(0, Math.round(parseNum(req.body.followers, 0)));
  run('UPDATE accounts SET handle = ?, profile_url = ?, followers = COALESCE(?, followers) WHERE id = ?', [
    handle,
    profileUrl,
    followers,
    account.id,
  ]);
  if (followers !== null) {
    run(
      'INSERT INTO metrics (id, user_id, account_id, date, views, followers, likes, comments, shares, source, is_sample, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, 0, 0, ?, 0, ?)',
      [uuid(), req.user.id, account.id, today(), followers, 'manual', nowIso()],
    );
  }
  res.json({ account: get('SELECT * FROM accounts WHERE id = ?', [account.id]) });
});

router.delete('/accounts/:id', requireAuth, (req, res) => {
  const account = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  transaction(() => {
    run('DELETE FROM metrics WHERE user_id = ? AND account_id = ?', [req.user.id, account.id]);
    run('UPDATE videos SET account_id = NULL WHERE user_id = ? AND account_id = ?', [req.user.id, account.id]);
    run('DELETE FROM accounts WHERE id = ?', [account.id]);
  });
  res.json({ ok: true });
});

router.post('/accounts/:id/sync', requireAuth, async (req, res) => {
  const account = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  if (account.platform !== 'youtube') {
    return res.status(400).json({
      error: `Automatic sync for ${platformById(account.platform).name} needs that platform's OAuth app credentials, which are not configured here. Add your stats manually or import a CSV export instead.`,
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
  }
  if (!youtubeConfigured()) {
    return res.status(400).json({
      error: 'YouTube sync needs a YOUTUBE_API_KEY environment variable. Add it in Settings → Environment variables, then sync again.',
      code: 'INTEGRATION_NOT_CONFIGURED',
    });
  }
  const channel = await fetchChannel(account.handle);
  if (!channel) {
    return res.status(404).json({ error: 'That YouTube channel could not be found publicly. Check the handle and try again.' });
  }
  run(
    'UPDATE accounts SET followers = ?, verified = 1, last_synced_at = ?, handle = ? WHERE id = ?',
    [channel.followers, nowIso(), channel.title || account.handle, account.id],
  );
  run(
    'INSERT INTO metrics (id, user_id, account_id, date, views, followers, likes, comments, shares, source, is_sample, created_at) VALUES (?, ?, ?, ?, 0, ?, 0, 0, 0, ?, 0, ?)',
    [uuid(), req.user.id, account.id, today(), channel.followers, 'youtube_api', nowIso()],
  );
  res.json({
    account: get('SELECT * FROM accounts WHERE id = ?', [account.id]),
    source: 'youtube_data_api',
    channel,
    note: 'Follower count refreshed from the official YouTube Data API. Public totals only — private analytics require OAuth.',
  });
});

router.get('/accounts/:id/metrics', requireAuth, (req, res) => {
  const account = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const rows = all('SELECT * FROM metrics WHERE user_id = ? AND account_id = ? ORDER BY date DESC LIMIT 120', [
    req.user.id,
    account.id,
  ]);
  res.json({ metrics: rows });
});

router.post('/accounts/:id/metrics', requireAuth, (req, res) => {
  const account = get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  const date = isDate(req.body?.date) ? req.body.date : today();
  const values = {
    views: Math.max(0, Math.round(parseNum(req.body?.views, 0))),
    followers: Math.max(0, Math.round(parseNum(req.body?.followers, 0))),
    likes: Math.max(0, Math.round(parseNum(req.body?.likes, 0))),
    comments: Math.max(0, Math.round(parseNum(req.body?.comments, 0))),
    shares: Math.max(0, Math.round(parseNum(req.body?.shares, 0))),
  };
  run(
    `INSERT INTO metrics (id, user_id, account_id, date, views, followers, likes, comments, shares, source, is_sample, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 0, ?)`,
    [uuid(), req.user.id, account.id, date, values.views, values.followers, values.likes, values.comments, values.shares, nowIso()],
  );
  res.status(201).json({ ok: true, date });
});

router.post('/metrics/import', requireAuth, (req, res) => {
  const csv = String(req.body?.csv || '').slice(0, 500000);
  if (!csv.trim()) return res.status(400).json({ error: 'Paste a CSV export or choose a .csv file first.' });
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return res.status(400).json({ error: 'The CSV needs a header row and at least one data row.' });

  const splitRow = (line) => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim().replace(/^"|"$/g, ''));
  };

  const header = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const col = (...names) => header.findIndex((h) => names.includes(h));
  const idx = {
    date: col('date', 'day', 'posted_at'),
    platform: col('platform', 'network'),
    handle: col('handle', 'account', 'username'),
    views: col('views', 'video_views', 'plays'),
    followers: col('followers', 'subscribers'),
    likes: col('likes'),
    comments: col('comments'),
    shares: col('shares', 'reposts'),
  };
  if (idx.date === -1 || idx.views === -1) {
    return res.status(400).json({ error: 'CSV must include at least "date" and "views" columns.' });
  }

  let imported = 0;
  const skipped = [];
  transaction(() => {
    for (let i = 1; i < lines.length; i += 1) {
      const row = splitRow(lines[i]);
      const date = row[idx.date];
      if (!isDate(date)) {
        skipped.push(i + 1);
        continue;
      }
      const platform = (idx.platform >= 0 && row[idx.platform]) || 'tiktok';
      if (!platformIds.has(platform)) {
        skipped.push(i + 1);
        continue;
      }
      const handle = (idx.handle >= 0 && row[idx.handle]) || 'imported-account';
      let account = get('SELECT * FROM accounts WHERE user_id = ? AND platform = ? AND lower(handle) = lower(?)', [
        req.user.id,
        platform,
        handle,
      ]);
      if (!account) {
        const accountId = uuid();
        run(
          `INSERT INTO accounts (id, user_id, platform, handle, connection_type, followers, created_at)
           VALUES (?, ?, ?, ?, 'imported', 0, ?)`,
          [accountId, req.user.id, platform, handle, nowIso()],
        );
        account = get('SELECT * FROM accounts WHERE id = ?', [accountId]);
      }
      const pick = (key) => (idx[key] >= 0 ? Math.max(0, Math.round(parseNum(row[idx[key]], 0))) : 0);
      run(
        `INSERT INTO metrics (id, user_id, account_id, date, views, followers, likes, comments, shares, source, is_sample, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv_import', 0, ?)`,
        [uuid(), req.user.id, account.id, date, pick('views'), pick('followers'), pick('likes'), pick('comments'), pick('shares'), nowIso()],
      );
      imported += 1;
    }
  });

  res.json({ imported, skipped: skipped.length, skippedRows: skipped.slice(0, 10) });
});

router.post('/metrics/sample', requireAuth, (req, res) => {
  if (get('SELECT id FROM metrics WHERE user_id = ? AND is_sample = 1 LIMIT 1', [req.user.id])) {
    return res.status(409).json({ error: 'Demo data is already loaded. Remove it first to start fresh.' });
  }
  const demoAccounts = [
    { platform: 'tiktok', handle: 'influencer.demo', followers: 48200, base: 18000, growth: 1.9 },
    { platform: 'instagram', handle: 'influencer.demo', followers: 21400, base: 9000, growth: 1.3 },
    { platform: 'youtube', handle: 'InfluencerDemo', followers: 8600, base: 3200, growth: 0.9 },
  ];
  transaction(() => {
    demoAccounts.forEach((demo, accountIndex) => {
      const accountId = uuid();
      run(
        `INSERT INTO accounts (id, user_id, platform, handle, connection_type, followers, notes, created_at)
         VALUES (?, ?, ?, ?, 'sample', ?, 'Demo account created by the sample dataset', ?)`,
        [accountId, req.user.id, demo.platform, demo.handle, demo.followers, nowIso()],
      );
      for (let dayOffset = 27; dayOffset >= 0; dayOffset -= 1) {
        const date = new Date(Date.now() - dayOffset * 864e5).toISOString().slice(0, 10);
        const wave = Math.sin((27 - dayOffset) / 3.2 + accountIndex) * 0.16 + 1;
        const views = Math.round(demo.base * demo.growth ** ((27 - dayOffset) / 27) * wave);
        const likes = Math.round(views * (0.06 + accountIndex * 0.012));
        const comments = Math.round(likes * 0.09);
        const shares = Math.round(likes * 0.14);
        const followers = Math.round(demo.followers * (0.82 + (0.18 * (27 - dayOffset)) / 27));
        run(
          `INSERT INTO metrics (id, user_id, account_id, date, views, followers, likes, comments, shares, source, is_sample, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sample', 1, ?)`,
          [uuid(), req.user.id, accountId, date, views, followers, likes, comments, shares, nowIso()],
        );
      }
    });
  });
  res.status(201).json({ ok: true, accounts: demoAccounts.length, days: 28 });
});

router.delete('/metrics/sample', requireAuth, (req, res) => {
  transaction(() => {
    const sampleAccounts = all("SELECT id FROM accounts WHERE user_id = ? AND connection_type = 'sample'", [req.user.id]);
    run('DELETE FROM metrics WHERE user_id = ? AND is_sample = 1', [req.user.id]);
    for (const account of sampleAccounts) run('DELETE FROM accounts WHERE id = ?', [account.id]);
  });
  res.json({ ok: true });
});

export default router;
