import { Router } from 'express';
import { get, run } from '../db.js';
import {
  clearedCookie,
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireAuth,
  sessionCookie,
  userFromRequest,
  verifyPassword,
} from '../lib/auth.js';
import { nowIso, safeText, uuid } from '../lib/util.js';
import { planFor } from '../lib/plans.js';
import { usageFor } from '../lib/usage.js';

const router = Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', (req, res) => {
  const name = safeText(req.body?.name, 80);
  const email = safeText(req.body?.email, 160).toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (get('SELECT id FROM users WHERE email = ?', [email])) {
    return res.status(409).json({ error: 'An account with that email already exists. Try signing in.' });
  }

  const id = uuid();
  run('INSERT INTO users (id, name, email, password_hash, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    name,
    email,
    hashPassword(password),
    'free',
    nowIso(),
  ]);
  const user = get('SELECT * FROM users WHERE id = ?', [id]);
  const { token, expires } = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(token, expires));
  res.status(201).json({ user: publicUser(user), plan: planFor(user.plan), usage: usageFor(user) });
});

router.post('/login', (req, res) => {
  const email = safeText(req.body?.email, 160).toLowerCase();
  const password = String(req.body?.password || '');
  const user = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const { token, expires } = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(token, expires));
  res.json({ user: publicUser(user), plan: planFor(user.plan), usage: usageFor(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req);
  res.setHeader('Set-Cookie', clearedCookie());
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user: publicUser(user), plan: planFor(user.plan), usage: usageFor(user) });
});

router.patch('/me', requireAuth, (req, res) => {
  const name = safeText(req.body?.name, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name (at least 2 characters).' });
  run('UPDATE users SET name = ? WHERE id = ?', [name, req.user.id]);
  const user = get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: publicUser(user) });
});

router.post('/me/password', requireAuth, (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  if (!verifyPassword(current, req.user.password_hash)) {
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  }
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(next), req.user.id]);
  res.json({ ok: true });
});

router.delete('/me', requireAuth, (req, res) => {
  const userId = req.user.id;
  for (const table of ['analyses', 'video_exports', 'videos', 'metrics', 'competitor_posts', 'competitors', 'assistant_items', 'accounts', 'sessions']) {
    run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  run('DELETE FROM users WHERE id = ?', [userId]);
  res.setHeader('Set-Cookie', clearedCookie());
  res.json({ ok: true });
});

export default router;
