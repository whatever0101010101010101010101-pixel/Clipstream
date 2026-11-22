import fs from 'node:fs';
import path from 'node:path';
import { get, run, UPLOAD_DIR } from '../db.js';
import { nowIso, round, uuid } from './util.js';
import { audioStats, frameStats, makeThumbnail, probe, sceneStats } from './media.js';
import { buildAnalysis } from './analyze.js';

const running = new Set();

export function enqueueAnalysis(videoId) {
  if (running.has(videoId)) return;
  running.add(videoId);
  setImmediate(async () => {
    try {
      await runAnalysis(videoId);
    } catch (err) {
      console.error('[analysis] failed:', err.message);
      run("UPDATE videos SET status = 'failed', error = ? WHERE id = ?", [
        String(err.message || 'Analysis failed').slice(0, 300),
        videoId,
      ]);
    } finally {
      running.delete(videoId);
    }
  });
}

export async function runAnalysis(videoId) {
  const video = get('SELECT * FROM videos WHERE id = ?', [videoId]);
  if (!video) throw new Error('Video not found');
  const file = path.join(UPLOAD_DIR, video.filename);
  if (!fs.existsSync(file)) throw new Error('The uploaded file is no longer on disk. Please upload it again.');

  run("UPDATE videos SET status = 'processing', error = NULL WHERE id = ?", [videoId]);

  let context = {};
  try {
    context = JSON.parse(video.context_json || '{}');
  } catch {
    context = {};
  }

  const probeInfo = await probe(file);
  const [audio, scenes, frames] = await Promise.all([
    audioStats(file, probeInfo.hasAudio),
    sceneStats(file, 240),
    frameStats(file, Math.min(1, Math.max(0, probeInfo.duration / 2))),
  ]);

  let thumbPath = null;
  try {
    const thumbName = `${video.id}.jpg`;
    await makeThumbnail(file, path.join(UPLOAD_DIR, thumbName), Math.min(1.5, Math.max(0.1, probeInfo.duration / 3)));
    thumbPath = thumbName;
  } catch (err) {
    console.warn('[analysis] thumbnail failed:', err.message);
  }

  const analysis = buildAnalysis({
    probe: probeInfo,
    audio,
    scenes,
    frames,
    context,
    platformId: video.platform,
  });

  run(
    `INSERT INTO analyses (id, video_id, user_id, scores_json, metrics_json, findings_json, summary, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      video.id,
      video.user_id,
      JSON.stringify(analysis.scores),
      JSON.stringify(analysis.metrics),
      JSON.stringify(analysis.findings),
      analysis.summary,
      'media-heuristics',
      nowIso(),
    ],
  );

  run(
    "UPDATE videos SET status = 'ready', duration = ?, thumb_path = ?, error = NULL WHERE id = ?",
    [round(probeInfo.duration, 1), thumbPath, video.id],
  );

  return analysis;
}

export function latestAnalysis(videoId) {
  const row = get(
    'SELECT * FROM analyses WHERE video_id = ? ORDER BY created_at DESC LIMIT 1',
    [videoId],
  );
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    summary: row.summary,
    scores: JSON.parse(row.scores_json || '{}'),
    metrics: JSON.parse(row.metrics_json || '{}'),
    findings: JSON.parse(row.findings_json || '[]'),
  };
}
