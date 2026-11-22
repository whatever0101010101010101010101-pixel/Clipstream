/**
 * Functional regression check for the INFLUENCER analysis engine.
 * Generates a real video with ffmpeg, runs the full pipeline, and asserts
 * that scores, findings and improvements are produced from measured signals.
 *
 * Run: node scripts/analysis-test.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influencer-test-'));
process.env.DATA_DIR = dataDir;

const { initDb, run, get } = await import('../server/db.js');
const { runAnalysis } = await import('../server/lib/pipeline.js');
const { ruleImprovements } = await import('../server/lib/improve.js');

const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// The pipeline reads files from UPLOAD_DIR, so the fixture must live there.
const workDir = path.join(dataDir, 'uploads');
fs.mkdirSync(workDir, { recursive: true });
const sample = path.join(workDir, 'sample.mp4');

console.log('1. Generating a 9:16 test video with ffmpeg…');
execFileSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc=size=1080x1920:rate=30:duration=9',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=9',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-shortest', sample,
]);
check('test video created', fs.existsSync(sample) && fs.statSync(sample).size > 1000);

console.log('2. Running the analysis pipeline…');
await initDb();
const videoId = 'test-video-1';
run(
  `INSERT INTO videos (id, user_id, title, platform, filename, original_name, mime, size_bytes, status, context_json,
    reported_views, reported_likes, reported_comments, reported_shares, created_at)
   VALUES (?, 'test-user', ?, 'tiktok', ?, 'sample.mp4', 'video/mp4', ?, 'queued', ?, 12000, 900, 70, 40, ?)`,
  [
    videoId,
    'Editing test upload',
    'sample.mp4',
    fs.statSync(sample).size,
    JSON.stringify({
      topic: 'video editing',
      hasCaptions: 'no',
      structure: 'hook-problem-payoff',
      hasCta: 'yes',
      originality: 'original',
      retentionPct: 42,
    }),
    new Date().toISOString(),
  ],
);

await runAnalysis(videoId);

const video = get('SELECT * FROM videos WHERE id = ?', [videoId]);
const analysis = get('SELECT * FROM analyses WHERE video_id = ?', [videoId]);

check('video status is ready', video?.status === 'ready', `status=${video?.status}`);
check('duration measured by ffprobe', Number(video?.duration) > 7, `${video?.duration}s`);
check('thumbnail generated', Boolean(video?.thumb_path) && fs.existsSync(path.join(dataDir, 'uploads', video.thumb_path)));
check('analysis row stored', Boolean(analysis));

const scores = JSON.parse(analysis?.scores_json || '{}');
const metrics = JSON.parse(analysis?.metrics_json || '{}');
const findings = JSON.parse(analysis?.findings_json || '[]');

const scoreKeys = ['hook', 'editing', 'audio', 'quality', 'length', 'pacing', 'captions', 'storytelling', 'engagement', 'retention', 'originality', 'overall'];
check('all score dimensions present', scoreKeys.every((k) => Number.isFinite(scores[k])), Object.keys(scores).join(','));
check('scores inside 5-97 range', scoreKeys.every((k) => scores[k] >= 5 && scores[k] <= 97), `overall=${scores.overall}`);
check('resolution measured', metrics.width === 1080 && metrics.height === 1920, `${metrics.width}x${metrics.height}`);
check('cuts detected', Number(metrics.cuts) > 0, `${metrics.cuts} cuts, ${metrics.cutsPerMinute}/min`);
check('audio measured', metrics.hasAudio === true && Number.isFinite(metrics.meanVolume), `mean=${metrics.meanVolume} dB`);
check('luma measured from frame', Number.isFinite(metrics.luma), `luma=${metrics.luma}`);
check('findings produced', Array.isArray(findings) && findings.length > 0, `${findings.length} findings`);
check('findings explain fixes', findings.every((f) => f.title && f.detail && f.fix && f.severity));
check('no-captions issue flagged from declared input', findings.some((f) => f.area === 'captions' && f.severity === 'critical'));
check('summary states it is an estimate', /estimate|not a guarantee/i.test(analysis?.summary || ''), analysis?.summary?.slice(0, 80));

console.log('3. Checking the improvement generator…');
const improvements = ruleImprovements({
  analysis: { scores, findings, metrics },
  context: { topic: 'video editing' },
  title: 'Editing test upload',
  platformId: 'tiktok',
});
check('improvements include hooks', improvements.hooks.length >= 3);
check('improvements include titles', improvements.titles.length >= 3);
check('improvements include hashtags', improvements.hashtags.length >= 5, `${improvements.hashtags.length} tags`);
check('improvements include thumbnail concepts', improvements.thumbnails.length >= 2);
check('improvements include posting windows', improvements.postingTimes.length >= 1);
check('improvements carry a disclaimer', /not a guarantee|estimate/i.test(improvements.disclaimer));

fs.rmSync(dataDir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nAll analysis engine checks passed.');
