import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDateTime } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, InfoNote, Input, Select, Textarea } from '../ui.jsx';

const PLATFORM_OPTIONS = [
  ['tiktok', 'TikTok'],
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['facebook', 'Facebook'],
  ['x', 'X (Twitter)'],
  ['threads', 'Threads'],
  ['snapchat', 'Snapchat'],
  ['linkedin', 'LinkedIn'],
];

const KIND_FALLBACK = [
  { id: 'ideas', name: 'Video ideas', description: 'Fresh angles for your next uploads.' },
  { id: 'script', name: 'Script', description: 'A tight script with hook, beats and CTA.' },
  { id: 'hooks', name: 'Hooks', description: 'Opening lines built for the first 3 seconds.' },
  { id: 'captions', name: 'Captions', description: 'Caption copy plus hashtags.' },
  { id: 'calendar', name: 'Content calendar', description: 'A posting plan for the next two weeks.' },
];

function OutputBlock({ output }) {
  if (!output) return null;
  if (typeof output === 'string') return <div className="output-box">{output}</div>;

  const entries = Object.entries(output).filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <div className="stack" style={{ gap: 16 }}>
      {entries.map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
        if (typeof value === 'string') {
          return (
            <div key={key}>
              <h4 className="section-label">{label}</h4>
              <div className="output-box">{value}</div>
            </div>
          );
        }
        if (Array.isArray(value)) {
          if (!value.length) return null;
          const simple = value.every((item) => typeof item === 'string' || typeof item === 'number');
          return (
            <div key={key}>
              <h4 className="section-label">{label}</h4>
              {simple ? (
                <div className="tag-row">
                  {value.map((item, index) => <span key={index} className="chip">{String(item)}</span>)}
                </div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {value.map((item, index) => (
                    <div key={index} className="improve-item">
                      {typeof item === 'object' ? (
                        Object.entries(item).map(([field, fieldValue]) => (
                          <p key={field} style={{ fontSize: 13, marginBottom: 2 }}>
                            <strong style={{ color: field === 'day' || field === 'time' ? 'var(--violet)' : 'var(--text)' }}>
                              {String(fieldValue)}
                            </strong>
                            {typeof fieldValue === 'string' ? '' : ''}
                          </p>
                        ))
                      ) : (
                        <span>{String(item)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
        if (typeof value === 'object') {
          return (
            <div key={key}>
              <h4 className="section-label">{label}</h4>
              <div className="output-box">
                {Object.entries(value).map(([field, fieldValue]) => (
                  <div key={field} style={{ marginBottom: 6 }}>
                    <strong style={{ fontSize: 12.5, color: 'var(--violet)' }}>{field}: </strong>
                    <span style={{ fontSize: 13 }}>{typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function Assistant() {
  const { plan, refresh } = useAuth();
  const [state, setState] = useState({ loading: true, kinds: [], items: [], assistantEnabled: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ kind: 'ideas', platform: 'tiktok', topic: '', notes: '', tone: 'direct' });

  async function load() {
    try {
      const data = await api('/assistant');
      setState({
        loading: false,
        kinds: data.kinds?.length ? data.kinds : KIND_FALLBACK,
        items: data.items || [],
        assistantEnabled: Boolean(data.assistantEnabled),
      });
    } catch (err) {
      setState({ loading: false, kinds: KIND_FALLBACK, items: [], assistantEnabled: false });
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function generate(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const data = await api('/assistant/generate', { method: 'POST', body: form });
      setResult(data.item || data);
      await refresh();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const kinds = state.kinds.length ? state.kinds : KIND_FALLBACK;
  const activeKind = kinds.find((kind) => kind.id === form.kind) || kinds[0];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">AI content assistant</h1>
          <p className="page-sub">Ideas, scripts, hooks, captions and calendars tuned to your platform and niche.</p>
        </div>
        <div className="page-actions">
          <Badge tone={state.assistantEnabled ? 'success' : 'info'}>
            {state.assistantEnabled ? 'Included in your plan' : `Plan: ${plan?.name || 'Free'}`}
          </Badge>
        </div>
      </div>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      {!state.assistantEnabled && !state.loading ? (
        <InfoNote tone="warn">
          The full assistant is part of Pro and Elite. You can still generate basic ideas on Free —{' '}
          <Link to="/app/billing" className="card-link">compare plans</Link>.
        </InfoNote>
      ) : null}

      <div className="assistant-layout">
        <Card title="Generate" subtitle={activeKind?.description || 'Tell it what you need.'}>
          <form className="stack" style={{ gap: 14 }} onSubmit={generate}>
            <Field label="What do you need?" htmlFor="kind">
              <Select id="kind" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {kinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>{kind.name || kind.label || kind.id}</option>
                ))}
              </Select>
            </Field>
            <Field label="Platform" htmlFor="a-platform">
              <Select id="a-platform" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}>
                {PLATFORM_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Topic or niche" htmlFor="a-topic" hint="The more specific, the better.">
              <Input id="a-topic" value={form.topic} onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))} required maxLength={200} placeholder="e.g. budget home gym for small apartments" />
            </Field>
            <Field label="Tone" htmlFor="a-tone">
              <Select id="a-tone" value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}>
                <option value="direct">Direct</option>
                <option value="funny">Funny</option>
                <option value="educational">Educational</option>
                <option value="story">Story-driven</option>
                <option value="bold">Bold / controversial</option>
              </Select>
            </Field>
            <Field label="Extra context" htmlFor="a-notes" hint="Audience, past results, constraints.">
              <Textarea id="a-notes" rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} maxLength={1200} />
            </Field>
            <Button type="submit" variant="primary" loading={busy} block>
              {busy ? 'Generating…' : 'Generate'}
            </Button>
          </form>
        </Card>

        <Card
          title="Result"
          subtitle={result ? `${result.kind || form.kind} · ${result.source === 'llm' ? 'AI model' : 'assistant rules'}` : 'Your generated output appears here.'}
          action={result ? <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Clear</Button> : null}
        >
          {busy ? (
            <div className="stack" style={{ gap: 10 }}>
              <div className="skeleton" style={{ height: 18, width: '70%' }} />
              <div className="skeleton" style={{ height: 14 }} />
              <div className="skeleton" style={{ height: 14 }} />
              <div className="skeleton" style={{ height: 14, width: '85%' }} />
              <p style={{ color: 'var(--muted)', fontSize: 12.5 }}>Writing with your platform and niche in mind…</p>
            </div>
          ) : result ? (
            <OutputBlock output={result.output || result.result || result} />
          ) : (
            <EmptyState
              icon="🤖"
              title="Nothing generated yet"
              text="Pick what you need, add a topic, and the assistant writes hooks, scripts, captions or a calendar."
            />
          )}
        </Card>
      </div>

      <Card title="Recent generations" subtitle="Your last 30 assistant outputs.">
        {state.loading ? (
          <div className="stack" style={{ gap: 10 }}>
            <div className="skeleton" style={{ height: 46 }} />
            <div className="skeleton" style={{ height: 46 }} />
          </div>
        ) : state.items.length === 0 ? (
          <EmptyState icon="🗂️" title="No history yet" text="Generated content is saved here for reuse." />
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {state.items.map((item) => (
              <details key={item.id} className="history-details">
                <summary>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{item.kind}</span>
                  <span style={{ color: 'var(--muted-2)', fontSize: 11.5 }}>
                    {item.input?.topic ? ` · ${item.input.topic}` : ''} · {fmtDateTime(item.createdAt)}
                  </span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <OutputBlock output={item.output} />
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
