import { llmConfigured, llmText } from './ai.js';
import { platformById } from './plans.js';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ASSISTANT_KINDS = {
  ideas: { label: 'Video ideas', hint: 'Give me 7 video ideas for my niche' },
  script: { label: 'Script', hint: 'Write a 30-second script' },
  hooks: { label: 'Hooks', hint: 'Give me 5 opening hooks' },
  captions: { label: 'Captions', hint: 'Write captions for my next post' },
  hashtags: { label: 'Hashtags', hint: 'Recommend hashtags for my niche' },
  calendar: { label: 'Content calendar', hint: 'Plan my next 7 days' },
  strategy: { label: 'Growth strategy', hint: 'What should I fix first?' },
};

const topicOf = (input) => (input.topic || input.notes || 'your niche').toString().trim().slice(0, 120);

export function ruleAssistant({ kind, input = {}, platformId = 'tiktok', performance = {} }) {
  const platform = platformById(platformId);
  const topic = topicOf(input);
  const tone = input.tone || 'direct and friendly';
  const [idealMin, idealMax] = platform.idealLength;
  const weakest = performance.weakest || 'hook';
  const avgScore = performance.avgScore;

  const header = `**${platform.name} · ${topic}** — built with INFLUENCER's rule engine (no AI provider key configured, so this is a structured template rather than a model generation).`;

  const sections = {
    ideas: `${header}

1. **The 3-second fix** — show a bad version of ${topic} for 2s, then the corrected version. Format: before/after.
2. **Myth vs measured** — debunk one common ${topic} belief with a screen recording as proof.
3. **30-day test** — one variable, one result, one number on screen.
4. **Beginner mistake** — name the mistake in the first sentence, fix it in the last.
5. **Tool teardown** — walk through the exact workflow you use for ${topic} in under ${idealMax}s.
6. **Reply to a comment** — screenshot a real question and answer it on camera.
7. **Cheap vs premium** — same result, two budgets, split screen.

Each idea is designed for ${idealMin}–${idealMax}s and should open on the result, not the setup.`,

    script: `${header}

**Hook (0–3s)** — "Stop scrolling if you're still doing ${topic} this way."
**Setup (3–8s)** — one sentence on why the old way fails. No introductions, no "hey guys".
**Proof (8–20s)** — show the change on screen. Say the number out loud: "this cut 4 seconds of dead air".
**Payoff (20–${Math.min(idealMax, 40)}s)** — the corrected result, held for 2 full seconds so it registers.
**CTA (last 3s)** — "Save this and try it on your next post."

Tone: ${tone}. Total target: ${Math.round((idealMin + idealMax) / 2)}s.
Cut every pause longer than 0.4s and keep one text overlay per beat.`,

    hooks: `${header}

1. "Nobody talks about this ${topic} mistake."
2. "I tested ${topic} for 30 days — here's what actually worked."
3. "Stop doing this with ${topic}. Do this instead."
4. "This took me 6 months to learn about ${topic}."
5. "If your ${topic} isn't growing, check this first."

Rules that make these work: state the subject in the first 4 words, promise a specific outcome, and show the payoff frame while you say it.`,

    captions: `${header}

**Short (best for ${platform.name}):**
The ${topic} tip I wish I knew sooner. Save this for your next post 👇

**Story-driven:**
I spent weeks getting ${topic} wrong. One change fixed it — and it's in this video.

**Question-led:**
What's the biggest ${topic} mistake you see? Mine was skipping the first three seconds.

Add 3–5 niche hashtags plus 2 broad ones. Never stuff 30.`,

    hashtags: `${header}

**Niche:** #${topic.replace(/\s+/g, '').toLowerCase()} #creatortips #contentstrategy
**Format:** #shortformvideo #reels #fyp #videotips
**Audience:** #creatorlife #socialmediagrowth #creatoreconomy
**Platform-specific:** #${platform.id === 'youtube' ? 'youtubeshorts' : platform.id === 'instagram' ? 'reelsinstagram' : platform.id}

Use 8–12 total: mostly niche, two broad. Rotate them per post instead of reusing one block.`,

    calendar: `${header}

| Day | Idea | Format | Window |
| --- | --- | --- | --- |
${days
  .map(
    (day, i) =>
      `| ${day} | ${['Hook test', 'Myth vs measured', 'Behind the scenes', 'Tool teardown', 'Comment reply', '30-day result', 'Weekly recap'][i]} for ${topic} | ${i % 2 === 0 ? 'talking head + B-roll' : 'screen recording'} | ${platform.postingWindows[i % platform.postingWindows.length]} |`,
  )
  .join('\n')}

Post 4–5 times per week, keep each video inside ${idealMin}–${idealMax}s, and reuse the best hook as a new opening frame the following week.`,

    strategy: `${header}

${avgScore ? `Your analysed videos average **${avgScore}/100**.` : 'Upload a video to unlock measured scores.'}
The weakest area in your recent analyses is **${weakest}**.

**This week**
1. Fix ${weakest} first — it has the largest effect on retention.
2. Re-upload the same video with a new opening 3 seconds and compare.
3. Post at ${platform.postingWindows[0]}, then check 48-hour retention.

**Do not** change five variables at once; you will not know what worked.`,
  };

  return {
    source: 'rules',
    engine: 'INFLUENCER rule engine',
    output: sections[kind] || sections.ideas,
    disclaimer:
      'Generated guidance, not a guarantee of results. Platform algorithms and audience behaviour vary.',
  };
}

export async function generateAssistant({ kind, input = {}, platformId = 'tiktok', performance = {} }) {
  const rules = ruleAssistant({ kind, input, platformId, performance });
  if (!llmConfigured()) return rules;

  const platform = platformById(platformId);
  const system =
    'You are INFLUENCER, a senior social media growth strategist for video creators. ' +
    'Write practical, specific, platform-native guidance in short markdown sections with concrete numbers and examples. ' +
    'Never promise virality, never invent analytics you were not given, and never state a metric as measured when it is an estimate. ' +
    'Keep it under 320 words.';

  const user = JSON.stringify({
    task: kind,
    platform: platform.name,
    topic: topicOf(input),
    tone: input.tone || 'direct and friendly',
    notes: input.notes || '',
    idealLengthSeconds: platform.idealLength,
    creatorPerformance: performance,
  });

  const text = await llmText(system, user);
  if (!text) return rules;
  return {
    source: 'ai',
    engine: 'Connected AI provider',
    output: text,
    disclaimer:
      'Generated guidance, not a guarantee of results. Platform algorithms and audience behaviour vary.',
  };
}
