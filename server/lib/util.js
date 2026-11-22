import crypto from 'node:crypto';

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
export const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};
export const monthKey = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const parseNum = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/[,_\s]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};
export const parseJson = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
export const safeText = (value, max = 500) =>
  String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

export const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};
