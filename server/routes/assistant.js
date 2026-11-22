import { Router } from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { planFor } from '../lib/plans.js';
import { ASSISTANT_KINDS, generateAssistant } from '../lib/assistant.js';
import { nowIso, safeText, uuid } from '../lib/util.js';

const router = Router();

router.get('/assistant', requireAuth, (req, res) => {
  const rows = all('SELECT * FROM assistant_items WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json({
    kinds: Object.entries(ASSISTANT_KINDS).map(([id, meta]) => ({ id, ...meta })),
    plan: planFor(req.user.plan),
    assistantEnabled: Boolean(planFor(req.user.plan).assistant),
    items: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      input: JSON.parse(row.prompt_json || '{}'),
      output: row.output,
      source: row.source,
      createdAt: row.created_at,
    })),
  });
});

router.post('/assistant/generate', requireAuth, async (req, res) => {
  const plan = planFor(req.user.plan);
  if (!plan.assistant) {
    return res.status(402).json({
      error: 'The AI content assistant is available on Pro and Elite. Upgrade to generate scripts, hooks, captions and content calendars.',
      code: 'PLAN_REQUIRED',
    });
  }
  const kind = safeText(req.body?.kind, 40) || 'ideas';
  if (!ASSISTANT_KINDS[kind]) return res.status(400).json({ error: 'Choose a valid assistant task.' });
  const platformId = safeText(req.body?.platform, 30) || 'tiktok';
  const input = {
    topic: safeText(req.body?.topic, 160),
    notes: safeText(req.body?.notes, 600),
    tone: safeText(req.body?.tone, 60),
  };
  if (!input.topic && !input.notes) {
    return res.status(400).json({ error: 'Tell the assistant your niche or topic first.' });
  }

  const analyses = all(
    'SELECT scores_json FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 12',
    [req.user.id],
  ).map((row) => JSON.parse(row.scores_json || '{}'));
  const scoreKeys = ['hook', 'editing', 'audio', 'captions', 'pacing', 'engagement', 'retention', 'length', 'quality', 'storytelling'];
  const averages = scoreKeys
    .map((key) => {
      const values = analyses.map((s) => Number(s[key])).filter((n) => Number.isFinite(n));
      return { key, value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
    })
    .filter((entry) => entry.value !== null);
  const performance = {
    avgScore: analyses.length
      ? Math.round(analyses.reduce((acc, s) => acc + (Number(s.overall) || 0), 0) / analyses.length)
      : null,
    weakest: averages.sort((a, b) => a.value - b.value)[0]?.key || null,
    strongest: averages.sort((a, b) => b.value - a.value)[0]?.key || null,
    videosAnalysed: analyses.length,
  };

  const result = await generateAssistant({ kind, input, platformId, performance });
  const id = uuid();
  run(
    'INSERT INTO assistant_items (id, user_id, kind, prompt_json, output, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.id, kind, JSON.stringify({ ...input, platform: platformId }), result.output, result.source, nowIso()],
  );

  res.status(201).json({
    item: { id, kind, input: { ...input, platform: platformId }, output: result.output, source: result.source, createdAt: nowIso() },
    engine: result.engine,
    disclaimer: result.disclaimer,
  });
});

router.delete('/assistant/:id', requireAuth, (req, res) => {
  const row = get('SELECT id FROM assistant_items WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Assistant item not found.' });
  run('DELETE FROM assistant_items WHERE id = ?', [row.id]);
  res.json({ ok: true });
});

export default router;
