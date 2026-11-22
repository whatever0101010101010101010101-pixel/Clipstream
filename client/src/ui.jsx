import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/* --------------------------------- Toasts -------------------------------- */

const ToastContext = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 4800);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-dot" />
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => setToasts((list) => list.filter((t) => t.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* -------------------------------- Primitives ------------------------------ */

export function Spinner({ size = 18, label = 'Loading' }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label={label} />;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} btn-${size} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function Card({ children, className = '', title, subtitle, action, padded = true }) {
  return (
    <section className={`card ${padded ? 'card-padded' : ''} ${className}`}>
      {title || action ? (
        <header className="card-head">
          <div>
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-sub">{subtitle}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral', dot = false }) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, delta, deltaSuffix = '', accent = 'violet' }) {
  return (
    <div className={`stat stat-${accent}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-foot">
        {delta !== undefined && delta !== null && !Number.isNaN(Number(delta)) ? (
          <span className={Number(delta) >= 0 ? 'delta-up' : 'delta-down'}>
            {Number(delta) >= 0 ? '▲' : '▼'} {Math.abs(Number(delta)).toLocaleString()}{deltaSuffix}
          </span>
        ) : null}
        {hint ? <span className="stat-hint">{hint}</span> : null}
      </span>
    </div>
  );
}

export function ScoreRing({ score, size = 132, label = 'Overall score', stroke = 9 }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const gradientId = useMemo(() => `ring-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value} out of 100`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="55%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="ring-value"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-center">
        <strong>{Number.isFinite(Number(score)) ? value : '—'}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ScoreBar({ label, value, hint }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="score-bar">
      <div className="score-bar-top">
        <span>{label}</span>
        <strong>{Number.isFinite(Number(value)) ? v : '—'}</strong>
      </div>
      <div className="bar-track">
        <div className={`bar-fill bar-${scoreTone(v)}`} style={{ width: `${v}%` }} />
      </div>
      {hint ? <p className="score-bar-hint">{hint}</p> : null}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      {label ? <span className="field-label">{label}</span> : null}
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className="input select" {...props}>
      {children}
    </select>
  );
}

export function Textarea(props) {
  return <textarea className="input textarea" {...props} />;
}

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon = '◎' }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', radius = 8 }) {
  return <span className="skeleton" style={{ height, width, borderRadius: radius }} />;
}

export function ErrorBanner({ children, onRetry }) {
  if (!children) return null;
  return (
    <div className="banner banner-error" role="alert">
      <span>{children}</span>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function InfoNote({ children, tone = 'info' }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}

export function Progress({ value, max }) {
  const pct = max ? Math.min(100, (Number(value) / Number(max)) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PlatformChip({ platform, name, accent }) {
  const initials = (name || platform || '?')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="platform-chip" style={{ '--chip-accent': accent || '#8b5cf6' }}>
      <span className="platform-initials">{initials}</span>
      <span>{name || platform}</span>
    </span>
  );
}

export function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 80) return 'excellent';
  if (n >= 65) return 'strong';
  if (n >= 50) return 'fair';
  return 'weak';
}

export function severityTone(severity) {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warn';
  return 'info';
}
