import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { all, get, run } from '../db.js';
import { nowIso, uuid } from './util.js';

export const SESSION_COOKIE = 'inf_session';
const SESSION_DAYS = 30;

export const hashPassword = (password) => bcrypt.hashSync(String(password), 10);
export const verifyPassword = (password, hash) => {
  try {
    return bcrypt.compareSync(String(password), String(hash));
  } catch {
    return false;
  }
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [
    uuid(),
    userId,
    hashToken(token),
    nowIso(),
    expires.toISOString(),
  ]);
  return { token, expires };
}

export function sessionCookie(token, expires) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expires.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export const clearedCookie = () =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export function userFromRequest(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const row = get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(token), nowIso()],
  );
  return row || null;
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = user;
  return next();
}

export const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  plan: row.plan,
  createdAt: row.created_at,
});

export function cleanupSessions() {
  const removed = all('SELECT id FROM sessions WHERE expires_at <= ?', [nowIso()]);
  if (removed.length) run('DELETE FROM sessions WHERE expires_at <= ?', [nowIso()]);
}
