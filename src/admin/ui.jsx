import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ShieldCheck } from '../components/icons.jsx';

// ------------------------------------------------------------------
// Shared admin UI primitives (luxury charcoal / cream / gold system).
// ------------------------------------------------------------------

export function Spinner({ className = 'w-5 h-5' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-night-700/60 ${className}`} />;
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-night-700 text-cream-300 border-night-600',
    gold: 'bg-gold-500/15 text-gold-300 border-gold-500/30',
    green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    red: 'bg-burgundy-600/25 text-burgundy-400 border-burgundy-400/40',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30'
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}

const STATUS_TONES = {
  'Order Received': 'amber',
  Preparing: 'violet',
  'Out for Delivery': 'gold',
  Delivered: 'green',
  Cancelled: 'red'
};

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] || 'neutral'}>{status}</Badge>;
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="glass rounded-2xl p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-full border border-gold-500/25 bg-gold-500/10 flex items-center justify-center">
        <ShieldCheck className="w-5 h-5 text-gold-400" />
      </div>
      <p className="mt-4 text-sm font-semibold text-cream-200">{title}</p>
      {hint && <p className="mt-1 text-xs text-cream-500">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-2xl border border-burgundy-400/40 bg-burgundy-600/15 p-6 text-center">
      <p className="text-sm font-semibold text-burgundy-400">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-full bg-night-800 border border-gold-500/25 text-xs font-bold text-cream-200 hover:border-gold-500/50 transition">
          Try again
        </button>
      )}
    </div>
  );
}

export function Button({ variant = 'primary', className = '', loading = false, children, ...rest }) {
  const variants = {
    primary: 'bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 hover:brightness-110',
    secondary: 'bg-night-800 border border-gold-500/25 text-cream-200 hover:border-gold-500/50',
    danger: 'bg-burgundy-600 text-cream-100 hover:bg-burgundy-500',
    ghost: 'text-cream-300 hover:text-gold-300'
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Spinner className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, loading = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-sm rounded-3xl border border-gold-500/20 bg-night-900 p-6 shadow-2xl">
        <h3 className="font-display text-lg font-bold text-cream-100">{title}</h3>
        <p className="mt-2 text-sm text-cream-400 leading-relaxed">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl border border-gold-500/20 bg-night-900 p-5 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-lg font-bold text-cream-100">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full border border-gold-500/20 text-cream-400 hover:text-cream-100" aria-label="Close">✕</button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Toasts
// ------------------------------------------------------------------
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = ++idRef.current;
    const item = { id, type: 'success', duration: 4000, ...toast };
    setToasts((list) => [...list, item]);
    if (item.duration > 0) {
      window.setTimeout(() => dismiss(id), item.duration);
    }
    return id;
  }, [dismiss]);

  const toast = useMemo(() => ({
    success: (message, title = 'Done') => push({ type: 'success', title, message }),
    error: (message, title = 'Failed') => push({ type: 'error', title, message, duration: 7000 }),
    info: (message, title = 'Heads up') => push({ type: 'info', title, message })
  }), [push]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed z-[90] bottom-4 right-4 left-4 sm:left-auto flex flex-col gap-2 w-auto sm:w-80" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-2xl border p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 ${t.type === 'error' ? 'border-burgundy-400/40 bg-burgundy-700/40' : t.type === 'info' ? 'border-gold-500/30 bg-night-800/90' : 'border-emerald-500/30 bg-night-800/90'}`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${t.type === 'error' ? 'bg-burgundy-600 text-cream-100' : t.type === 'info' ? 'bg-gold-500/20 text-gold-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
              <Check className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-cream-100">{t.title}</p>
              {t.message && <p className="text-[11px] text-cream-400 mt-0.5 break-words">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-cream-500 hover:text-cream-200" aria-label="Dismiss notification">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { success: () => {}, error: () => {}, info: () => {} };
  return ctx;
}

// Close a dialog on Escape.
export function useEscape(active, handler) {
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, handler]);
}
