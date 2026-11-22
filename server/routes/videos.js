import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { all, get, run, transaction, UPLOAD_DIR } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { PLATFORMS, platformById } from '../lib/plans.js';
import { clamp, nowIso, parseNum, safeText, uuid } from '../lib/util.js';
import { analysisQuota, quotaError, usageFor } from '../lib/usage.js';
import { enqueueAnalysis, latestAnalysis } from '../lib/pipeline.js';
import { generateImprovements } from '../lib/improve.js';
import { makeExportClip } from '../lib/media.js';

const router = Router();
const platformIds = new Set(PLATFORMS.map((p) => p.id));
const allowedExt = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname || '.mp4').toLowerCase()}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okType = String(file.mimetype || '').startsWith('video/');
    if (okType || allowedExt.has(ext)) return cb(null, true);
    const err = new Error('Please upload a video file (MP4, MOV, WebM, MKV or AVI).');
    err.status = 400;
    return cb(err);
  },
});

const videoPayload = (row, analysis) => ({
  id: row.id,
  title: row.title,
  platform: row.platform,
  platformName: platformById(row.platform).name,
  accent: platformById(row.platform).accent,
  accountId: row.account_id,
  status: row.status,
  error: row.error,
  duration: row.duration,
  sizeBytes: row.size_bytes,
  originalName: row.original_name,
  createdAt: row.created_at,
  thumbUrl: row.thumb_path ? `/api/videos/${row.id}/thumb` : null,
  videoUrl: `/api/videos/${row.id}/file`,
  reported: {
    views: row.reported_views,
    likes: row.reported_likes,
    comments: row.reported_comments,
    shares: row.reported_shares,
  },
  scores: analysis?.scores || null,
  overall: analysis?.scores?.overall ?? null,
  summary: analysis?.summary || null,
  analysisId: analysis?.id || null,
  analysisCreatedAt: analysis?.createdAt || null,
});

router.post('/videos', requireAuth, upload.single('video'), async (req, res) => {
  const cleanup = () => {
    if (req.file) fs.promises.unlink(path.join(UPLOAD_DIR, req.file.filename)).catch(() => {});
  };

  if (!req.file) return res.status(400).json({ error: 'Choose a video file to analyse.' });
  const quota = analysisQuota(req.user);
  if (!quota.allowed) {
    cleanup();
    return res.status(402).json({ error: quotaError(quota), code: 'QUOTA_EXCEEDED', usage: quota });
  }

  const platform = platformIds.has(req.body?.platform) ? req.body.platform : 'tiktok';
  const title = safeText(req.body?.title, 140) || req.file.originalname || 'Untitled upload';
  const context = {
    topic: safeText(req.body?.topic, 140),
    hasCaptions: ['yes', 'no', 'auto', 'unknown'].includes(req.body?.hasCaptions) ? req.body.hasCaptions : 'unknown',
    structure: safeText(req.body?.structure, 40) || null,
    hasCta: ['yes', 'no'].includes(req.body?.hasCta) ? req.body.hasCta : null,
    originality: ['original', 'remix', 'repost'].includes(req.body?.originality) ? req.body.originality : 'unknown',
    retentionPct: req.body?.retentionPct ? clamp(parseNum(req.body.retentionPct, 0), 0, 100) : null,
  };

  const accountId = safeText(req.body?.accountId, 60) || null;
  if (accountId && !get('SELECT id FROM accounts WHERE id = ? AND user_id = ?', [accountId, req.user.id])) {
    cleanup();
    return res.status(400).json({ error: 'That connected account no longer exists.' });
  }

  const id = uuid();
  run(
    `INSERT INTO videos (id, user_id, account_id, title, platform, filename, original_name, mime, size_bytes, status, context_json,
      reported_views, reported_likes, reported_comments, reported_shares, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.user.id,
      accountId,
      title,
      platform,
      req.file.filename,
      safeText(req.file.originalname, 200),
      req.file.mimetype || 'video/mp4',
      req.file.size || 0,
      JSON.stringify(context),
      Math.max(0, Math.round(parseNum(req.body?.views, 0))),
      Math.max(0, Math.round(parseNum(req.body?.likes, 0))),
      Math.max(0, Math.round(parseNum(req.body?.comments, 0))),
      Math.max(0, Math.round(parseNum(req.body?.shares, 0))),
      nowIso(),
    ],
  );

  enqueueAnalysis(id);
  const row = get('SELECT * FROM videos WHERE id = ?', [id]);
  res.status(201).json({ video: videoPayload(row, null), usage: usageFor(req.user) });
});

router.get('/videos', requireAuth, (req, res) => {
  const platform = safeText(req.query?.platform, 30);
  const rows = platform && platformIds.has(platform)
    ? all('SELECT * FROM videos WHERE user_id = ? AND platform = ? ORDER BY created_at DESC LIMIT 100', [req.user.id, platform])
    : all('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  const videos = rows.map((row) => videoPayload(row, latestAnalysis(row.id)));
  res.json({ videos, usage: usageFor(req.user) });
});

router.get('/videos/:id', requireAuth, (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Video not found.' });
  const analysis = latestAnalysis(row.id);
  let improvements = null;
  if (analysis) {
    const stored = get('SELECT improvements_json FROM analyses WHERE id = ?', [analysis.id]);
    if (stored?.improvements_json) {
      try {
        improvements = JSON.parse(stored.improvements_json);
      } catch {
        improvements = null;
      }
    }
  }
  const exportsList = all('SELECT * FROM video_exports WHERE video_id = ? AND user_id = ? ORDER BY created_at DESC', [
    row.id,
    req.user.id,
  ]);
  res.json({
    video: videoPayload(row, analysis),
    analysis,
    improvements,
    exports: exportsList.map((e) => ({
      id: e.id,
      platform: e.platform,
      label: e.label,
      duration: e.duration,
      url: `/api/exports/${e.id}/file`,
      createdAt: e.created_at,
    })),
    context: JSON.parse(row.context_json || '{}'),
  });
});

router.get('/videos/:id/file', requireAuth, (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Video not found.' });
  const file = path.join(UPLOAD_DIR, row.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'The file is no longer available.' });
  const stat = fs.statSync(file);
  const range = req.headers.range;
  res.setHeader('Content-Type', row.mime || 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  if (range) {
    const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-');
    const start = Number(startRaw) || 0;
    const end = endRaw ? Math.min(Number(endRaw), stat.size - 1) : stat.size - 1;
    if (start >= stat.size) {
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      return res.status(416).end();
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': end - start + 1,
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.setHeader('Content-Length', stat.size);
  return fs.createReadStream(file).pipe(res);
});

router.get('/videos/:id/thumb', requireAuth, (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row || !row.thumb_path) return res.status(404).json({ error: 'No thumbnail available.' });
  const file = path.join(UPLOAD_DIR, row.thumb_path);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'No thumbnail available.' });
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(file);
});

router.post('/videos/:id/analyze', requireAuth, (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Video not found.' });
  const quota = analysisQuota(req.user);
  if (!quota.allowed) return res.status(402).json({ error: quotaError(quota), code: 'QUOTA_EXCEEDED', usage: quota });
  run("UPDATE videos SET status = 'queued', error = NULL WHERE id = ?", [row.id]);
  enqueueAnalysis(row.id);
  res.json({ ok: true, usage: usageFor(req.user) });
});

router.post('/videos/:id/improve', requireAuth, async (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Video not found.' });
  const analysis = latestAnalysis(row.id);
  if (!analysis) return res.status(409).json({ error: 'Analysis is not ready yet. Wait for it to finish, then try again.' });
  const context = JSON.parse(row.context_json || '{}');
  const improvements = await generateImprovements({
    analysis,
    context,
    title: row.title,
    platformId: row.platform,
  });
  run('UPDATE analyses SET improvements_json = ? WHERE id = ?', [JSON.stringify(improvements), analysis.id]);
  res.json({ improvements, analysis });
});

router.post('/videos/:id/exports', requireAuth, async (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Video not found.' });
  const platform = platformById(safeText(req.body?.platform, 30) || row.platform);
  const source = path.join(UPLOAD_DIR, row.filename);
  if (!fs.existsSync(source)) return res.status(404).json({ error: 'The source file is no longer available.' });

  const maxSeconds = Math.min(platform.idealLength[1], Math.max(5, row.duration || platform.idealLength[1]));
  const filename = `${row.id}-${platform.id}-${Date.now()}.mp4`;
  try {
    await makeExportClip(source, path.join(UPLOAD_DIR, filename), {
      duration: maxSeconds,
      vertical: platform.vertical,
    });
  } catch (err) {
    console.error('[export] failed:', err.message);
    return res.status(500).json({ error: 'Could not render that version. Try a shorter source clip or a different platform preset.' });
  }
  const id = uuid();
  run(
    `INSERT INTO video_exports (id, video_id, user_id, platform, label, filename, duration, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, row.id, req.user.id, platform.id, `${platform.name} cut · ${Math.round(maxSeconds)}s`, filename, maxSeconds, nowIso()],
  );
  res.status(201).json({
    export: {
      id,
      platform: platform.id,
      label: `${platform.name} cut · ${Math.round(maxSeconds)}s`,
      duration: maxSeconds,
      url: `/api/exports/${id}/file`,
    },
  });
});

router.get('/exports/:id/file', requireAuth, (req, res) => {
  const row = get('SELECT * FROM video_exports WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Export not found.' });
  const file = path.join(UPLOAD_DIR, row.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'That export is no longer on disk.' });
  return res.download(file, `${row.platform}-version.mp4`);
});

router.delete('/videos/:id', requireAuth, (req, res) => {
  const row = get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Video not found.' });
  const exportsList = all('SELECT filename FROM video_exports WHERE video_id = ? AND user_id = ?', [row.id, req.user.id]);
  transaction(() => {
    run('DELETE FROM analyses WHERE video_id = ? AND user_id = ?', [row.id, req.user.id]);
    run('DELETE FROM video_exports WHERE video_id = ? AND user_id = ?', [row.id, req.user.id]);
    run('DELETE FROM videos WHERE id = ?', [row.id]);
  });
  for (const f of [row.filename, row.thumb_path, ...exportsList.map((e) => e.filename)]) {
    if (f) fs.promises.unlink(path.join(UPLOAD_DIR, f)).catch(() => {});
  }
  res.json({ ok: true });
});

export default router;
