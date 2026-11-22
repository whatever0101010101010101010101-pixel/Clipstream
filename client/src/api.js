export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, null);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text.slice(0, 200) };
    }
  }

  if (!response.ok) {
    const message = payload?.error || `Request failed (${response.status}).`;
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('infl:unauthorized'));
    }
    throw new ApiError(message, response.status, payload);
  }
  return payload;
}

export const uploadVideo = (formData) => api('/videos', { method: 'POST', form: formData });

export const fmtNumber = (value) => {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return n.toLocaleString();
};

export const fmtPercent = (value) => `${(Number(value) || 0).toFixed(2)}%`;

export const fmtDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const fmtDuration = (seconds) => {
  const s = Math.round(Number(seconds) || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

export const scoreTone = (score) => {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 80) return 'excellent';
  if (n >= 65) return 'strong';
  if (n >= 50) return 'fair';
  return 'weak';
};

export const SCORE_LABELS = {
  hook: 'Hook (first 3s)',
  editing: 'Editing & transitions',
  audio: 'Audio quality',
  quality: 'Visual quality',
  length: 'Video length',
  pacing: 'Pacing',
  captions: 'Captions & subtitles',
  storytelling: 'Storytelling',
  engagement: 'Engagement potential',
  retention: 'Audience retention',
  originality: 'Content originality',
  overall: 'Overall content score',
};

export const PLATFORM_EMOJI = {
  tiktok: 'TT',
  instagram: 'IG',
  youtube: 'YT',
  facebook: 'FB',
  x: 'X',
  threads: 'TH',
  snapchat: 'SC',
  linkedin: 'IN',
};
