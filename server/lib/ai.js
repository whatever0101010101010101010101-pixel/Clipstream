const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export const llmConfigured = () => Boolean(process.env.OPENAI_API_KEY);

export const llmProviderLabel = () =>
  llmConfigured() ? `Connected AI provider (${MODEL})` : 'Built-in rule engine';

async function callLLM(messages, { json = false, timeout = 45000 } = {}) {
  if (!llmConfigured()) return null;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        max_tokens: 1600,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) {
      console.warn(`[ai] provider returned ${res.status}; using rule engine`);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? content.trim() : null;
  } catch (err) {
    console.warn('[ai] provider call failed; using rule engine:', err.message);
    return null;
  }
}

export async function llmJson(system, user) {
  const raw = await callLLM(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { json: true },
  );
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function llmText(system, user) {
  return callLLM([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]);
}
