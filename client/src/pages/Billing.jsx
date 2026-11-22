import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Button, Card, ErrorBanner, InfoNote, Progress } from '../ui.jsx';

export default function Billing() {
  const { refresh, plan: authPlan, usage: authUsage } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [checkoutError, setCheckoutError] = useState('');

  async function load() {
    try {
      const data = await api('/billing');
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState({ loading: false, error: err.message, data: null });
    }
  }

  useEffect(() => { load(); }, []);

  async function choose(nextPlan) {
    setBusy(nextPlan);
    setNotice('');
    try {
      const result = await api('/billing/plan', { method: 'POST', body: { plan: nextPlan } });
      setNotice(result.note || 'Plan updated.');
      await refresh();
      await load();
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    } finally {
      setBusy('');
    }
  }

  async function tryCheckout() {
    setCheckoutError('');
    try {
      await api('/billing/checkout', { method: 'POST', body: {} });
    } catch (err) {
      setCheckoutError(err.message);
    }
  }

  const data = state.data;
  const current = data?.plan || authPlan;
  const usage = data?.usage || authUsage;
  const plans = data?.plans || [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="page-title">Plans &amp; billing</h1>
          <p className="page-sub">Choose how many analyses and competitor slots you need each month.</p>
        </div>
        <div className="page-actions">
          <Badge tone="warn">Demo pricing</Badge>
        </div>
      </div>

      {state.error ? <ErrorBanner>{state.error}</ErrorBanner> : null}

      <InfoNote tone="warn">
        {data?.note ||
          'Demo pricing: plan changes are recorded on your account and nothing is charged. No card details are collected.'}
      </InfoNote>

      <Card title="Your current plan" subtitle={current?.tagline}>
        <div className="current-plan">
          <div>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>{current?.name || 'Free'}</h2>
              <Badge tone="info">{current?.priceLabel || '$0'} {current?.cadence || 'forever'}</Badge>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
              {usage?.used ?? 0} of {usage?.limit ?? '∞'} analyses used in {usage?.period || 'this month'} ·{' '}
              {current?.competitorSlots ?? 0} competitor slots
            </p>
          </div>
          <div style={{ minWidth: 220 }}>
            <Progress value={usage?.limit ? ((usage?.used || 0) / usage.limit) * 100 : 0} />
            <p style={{ color: 'var(--muted-2)', fontSize: 12, marginTop: 8 }}>
              {usage?.remaining != null ? `${usage.remaining} analyses left this month` : 'Unlimited analyses'}
            </p>
          </div>
        </div>
      </Card>

      {notice ? <InfoNote tone="success">{notice}</InfoNote> : null}

      <div className="pricing-grid">
        {plans.map((item) => {
          const isCurrent = item.id === current?.id;
          return (
            <div key={item.id} className={`price-card ${item.id === 'pro' ? 'price-card-featured' : ''}`}>
              {item.id === 'pro' ? <span className="badge badge-plan">Most popular</span> : null}
              <h3 style={{ margin: '10px 0 4px', fontSize: 19 }}>{item.name}</h3>
              <p style={{ color: 'var(--muted)', fontSize: 13, minHeight: 38 }}>{item.tagline}</p>
              <div className="price-amount">
                {item.priceLabel}
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}> / {item.cadence}</span>
              </div>
              <ul className="price-features">
                {item.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button
                variant={isCurrent ? 'outline' : 'primary'}
                block
                disabled={isCurrent}
                loading={busy === item.id}
                onClick={() => choose(item.id)}
              >
                {isCurrent ? 'Current plan' : `Switch to ${item.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      <Card title="Payment integration" subtitle="Real checkout requires a payment provider key.">
        <div className="stack" style={{ gap: 12 }}>
          <div className="row-between" style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--muted)' }}>Provider configured</span>
            <Badge tone={data?.paymentsConfigured ? 'success' : 'warn'}>
              {data?.paymentsConfigured ? 'Key detected' : 'Not configured'}
            </Badge>
          </div>
          <p style={{ color: 'var(--muted-2)', fontSize: 12.5 }}>
            Add <code>STRIPE_SECRET_KEY</code> and <code>STRIPE_WEBHOOK_SECRET</code> in Settings → Environment variables to
            enable real subscriptions in a future build. Plan switching above stays in demo mode until then.
          </p>
          {checkoutError ? <ErrorBanner>{checkoutError}</ErrorBanner> : null}
          <div>
            <Button variant="ghost" onClick={tryCheckout}>Check checkout availability</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
