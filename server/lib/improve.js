import { llmConfigured, llmJson } from './ai.js';
import { platformById } from './plans.js';

const titleCase = (s) =>
  String(s || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const topicWords = (context, title) => {
  const raw = (context.topic || title || 'your niche').replace(/[#@]/g, ' ');
  return raw.trim().split(/\s+/).slice(0, 6).join(' ');
};

const slugTags = (topic) =>
  String(topic || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);

export function ruleImprovements({ analysis, context = {}, title = '', platformId = 'tiktok' }) {
  const platform = platformById(platformId);
  const topic = topicWords(context, title);
  const topicTitle = titleCase(topic);
  const tags = slugTags(topic);
  const [idealMin, idealMax] = platform.idealLength;
  const scores = analysis.scores || {};
  const weakest = Object.entries(scores)
    .filter(([key]) => key !== 'overall')
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([key]) => key);

  const hooks = [
    {
      text: `Nobody talks about this ${topic} mistake — and it's costing you views.`,
      why: 'Pattern-interrupt plus a direct accusation creates curiosity in under two seconds.',
    },
    {
      text: `I tested ${topic} for 30 days. Here's what actually worked.`,
      why: 'Specific timeframe + outcome promise gives the viewer a reason to keep watching.',
    },
    {
      text: `Stop doing this with ${topic} (do this instead).`,
      why: 'Negative command + immediate fix is the most reliable short-form hook structure.',
    },
  ];

  const titles = [
    `${topicTitle}: the 3-second fix that changes everything`,
    `I wish someone told me this about ${topic} sooner`,
    `The ${topic} mistake 9 out of 10 creators make`,
  ];

  const caption = `The ${topic} tip I wish I knew earlier 👇 Save this before your next post, then tell me which part surprised you. #${tags[0] || 'creators'} #${tags[1] || 'contentstrategy'}`;

  const hashtags = [
    ...tags.map((t) => `#${t}`),
    `#${platform.id === 'x' ? 'buildinpublic' : 'creatortips'}`,
    '#contentcreator',
    '#socialmediagrowth',
    '#contentstrategy',
    '#videomarketing',
    '#creatoreconomy',
    '#shortformvideo',
    '#hookideas',
    '#growthtips',
    '#algorithm',
    '#reels',
    '#fyp',
    '#creatorlife',
    '#videotips',
  ].filter((tag, index, arr) => arr.indexOf(tag) === index).slice(0, 18);

  const editing = (analysis.findings || [])
    .filter((f) => f.severity !== 'good')
    .slice(0, 6)
    .map((f) => ({ action: f.fix, why: f.title }));

  if (!editing.length) {
    editing.push({
      action: 'Test two different opening frames and keep the one with higher 3-second retention.',
      why: 'Your technical scores are healthy, so packaging is the remaining lever.',
    });
  }

  return {
    source: 'rules',
    engine: 'INFLUENCER rule engine',
    hooks,
    titles,
    caption,
    hashtags,
    editing,
    suggestedLength: `${Math.round((idealMin + idealMax) / 2)}s (platform sweet spot: ${idealMin}–${idealMax}s)`,
    thumbnails: [
      {
        concept: 'Close-up face + 4-word overlay, high contrast, no background clutter.',
        why: 'Faces with short text overlays are the most legible thumbnail pattern on mobile feeds.',
      },
      {
        concept: `Split frame: "before" on the left, "after" on the right, arrow between them.`,
        why: 'A visual before/after promises a transformation the viewer can verify in one glance.',
      },
      {
        concept: `Bold number (for example "3") plus the topic "${topicTitle}" in your accent colour.`,
        why: 'Numbers set expectations for list content and increase click intent.',
      },
    ],
    postingTimes: platform.postingWindows.map((window) => ({
      window,
      note: 'General benchmark for this platform, not your personal audience data.',
    })),
    packaging: {
      firstFrame: 'Start on the most visually surprising frame of the clip, not the intro.',
      textOverlay: 'Max 6 words on screen in the first 3 seconds, inside the centre-safe area.',
    },
    notes: `Prioritise ${weakest.map((w) => w.replace(/^\w/, (c) => c.toUpperCase())).join(', ')}. These recommendations are generated from your measured signals and declared inputs; they are guidance, not a guarantee of reach.`,
    disclaimer:
      'AI guidance is an estimate. Platform algorithms, audience and timing all influence results.',
  };
}

function coerceList(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;
  return value
    .map((item) => {
      if (typeof item === 'string') return { text: item, why: '' };
      if (item && typeof item === 'object') {
        return { text: String(item.text || item.title || item.hook || ''), why: String(item.why || item.reason || '') };
      }
      return null;
    })
    .filter((item) => item && item.text)
    .slice(0, 6);
}

export async function generateImprovements({ analysis, context = {}, title = '', platformId = 'tiktok' }) {
  const rules = ruleImprovements({ analysis, context, title, platformId });
  if (!llmConfigured()) return rules;

  const platform = platformById(platformId);
  const payload = {
    platform: platform.name,
    title,
    topic: context.topic || title,
    durationSeconds: analysis.metrics?.duration,
    scores: analysis.scores,
    measured: analysis.metrics,
    issues: (analysis.findings || []).map((f) => ({ title: f.title, detail: f.detail, severity: f.severity })),
  };

  const result = await llmJson(
    'You are a senior short-form video strategist. Return ONLY JSON with keys: hooks (array of {text, why}), titles (array of strings), caption (string), hashtags (array of strings without spaces), editing (array of {action, why}), suggestedLength (string), thumbnails (array of {concept, why}), postingTimes (array of {window, note}), packaging ({firstFrame, textOverlay}), notes (string). Be concrete, never promise virality, and base advice on the supplied measurements.',
    JSON.stringify(payload),
  );
  if (!result) return rules;

  return {
    ...rules,
    source: 'ai',
    engine: 'Connected AI provider',
    hooks: coerceList(result.hooks, rules.hooks),
    titles: Array.isArray(result.titles) && result.titles.length ? result.titles.map(String).slice(0, 5) : rules.titles,
    caption: typeof result.caption === 'string' && result.caption.trim() ? result.caption.trim() : rules.caption,
    hashtags: Array.isArray(result.hashtags) && result.hashtags.length ? result.hashtags.map(String).slice(0, 20) : rules.hashtags,
    editing: coerceList(result.editing, rules.editing).map((item) => ({ action: item.text, why: item.why })),
    suggestedLength: typeof result.suggestedLength === 'string' ? result.suggestedLength : rules.suggestedLength,
    thumbnails: Array.isArray(result.thumbnails) && result.thumbnails.length
      ? result.thumbnails.map((t) => (typeof t === 'string' ? { concept: t, why: '' } : { concept: String(t.concept || ''), why: String(t.why || '') })).slice(0, 4)
      : rules.thumbnails,
    postingTimes: Array.isArray(result.postingTimes) && result.postingTimes.length
      ? result.postingTimes.map((t) => (typeof t === 'string' ? { window: t, note: 'AI suggestion' } : { window: String(t.window || ''), note: String(t.note || '') })).slice(0, 4)
      : rules.postingTimes,
    packaging: result.packaging && typeof result.packaging === 'object'
      ? { firstFrame: String(result.packaging.firstFrame || rules.packaging.firstFrame), textOverlay: String(result.packaging.textOverlay || rules.packaging.textOverlay) }
      : rules.packaging,
    notes: typeof result.notes === 'string' && result.notes.trim() ? result.notes.trim() : rules.notes,
    disclaimer: rules.disclaimer,
  };
}
