import { Router } from 'express';
import { PLANS, planFor, PAYMENTS_CONFIGURED } from '../lib/plans.js';
import { requireAuth } from '../lib/auth.js';
import { run } from '../db.js';
import { usageFor } from '../lib/usage.js';
import { nowIso } from '../lib/util.js';

const router = Router();

router.get('/plans', (req, res) => {
  res.json({
    plans: Object.values(PLANS),
    demoPricing: true,
    paymentsConfigured: PAYMENTS_CONFIGURED,
    note: 'Pricing is demo-only in this build. No card is charged and no payment provider is contacted.',
  });
});

router.get('/billing', requireAuth, (req, res) => {
  res.json({
    usage: usageFor(req.user),
    plan: planFor(req.user.plan),
    plans: Object.values(PLANS),
    demoPricing: true,
    paymentsConfigured: PAYMENTS_CONFIGURED,
    note: PAYMENTS_CONFIGURED
      ? 'A payment provider key is present, but checkout is not enabled in this build — plan changes are recorded locally as demo changes.'
      : 'Demo pricing: plan changes are recorded locally and nothing is charged. Add STRIPE_SECRET_KEY to enable real checkout in a future build.',
  });
});

router.post('/billing/plan', requireAuth, (req, res) => {
  const next = String(req.body?.plan || '').toLowerCase();
  if (!PLANS[next]) return res.status(400).json({ error: 'Choose Free, Pro or Elite.' });
  run('UPDATE users SET plan = ? WHERE id = ?', [next, req.user.id]);
  res.json({
    ok: true,
    plan: planFor(next),
    usage: usageFor({ ...req.user, plan: next }),
    demoPricing: true,
    note: `Switched to ${planFor(next).name}. This is a demo plan change — no payment was taken.`,
  });
});

router.post('/billing/checkout', requireAuth, (req, res) => {
  res.status(501).json({
    error: PAYMENTS_CONFIGURED
      ? 'Checkout is not enabled in this build. Plan changes are demo-only.'
      : 'Payments are not configured on this deployment. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable checkout; until then plans switch instantly in demo mode.',
    code: 'PAYMENTS_NOT_CONFIGURED',
    demoPricing: true,
    at: nowIso(),
  });
});

export default router;
