import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, RefreshCw } from '../components/icons.jsx';
import { Badge, Button, Skeleton, useToast, useEscape } from './ui.jsx';
import {
  loadAdminNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications
} from '../lib/dbService.js';

// ------------------------------------------------------------------
// Admin new-order notification bell (Phase 5).
//
// * Data comes exclusively from public.admin_notifications, written by
//   a database trigger — one row per order, so duplicate records are
//   impossible regardless of how many admin tabs are open.
// * Realtime via postgres_changes when available; polling fallback
//   keeps the unread badge fresh (Supabase reconnects automatically,
//   so this is belt-and-braces rather than a primary mechanism).
// * Everything is staff-only, enforced by RLS + staff-only RPCs.
// ------------------------------------------------------------------

const timeAgo = (iso) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export function NotificationsBell({ onOpenOrder, onOrdersChanged }) {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const panelRef = useRef(null);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const rows = await loadAdminNotifications({ limit: 50 });
      setNotifications(rows);
      setError('');
    } catch (err) {
      // PGRST205 (migration 008 not applied yet) and auth failures are
      // expected before rollout — show a friendly hint, not a crash.
      setError(err.message || 'Notifications are unavailable.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime inserts + automatic reconnect (see dbService for details).
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToNotifications((payload) => {
        if (payload && payload.__channelStatus) {
          // Channel state change (e.g. SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT).
          if (payload.__channelStatus === 'SUBSCRIBED') load({ silent: true });
          return;
        }
        if (payload?.new) {
          setNotifications((list) => {
            if (list.some((n) => n.id === payload.new.id)) return list;
            return [payload.new, ...list].slice(0, 50);
          });
          onOrdersChanged?.();
        }
      });
    } catch {
      /* polling fallback below */
    }
    return () => unsubscribe();
  }, [load, onOrdersChanged]);

  // Polling fallback (60s) — keeps the bell accurate even if realtime is
  // disabled for admin_notifications in the Supabase project settings.
  useEffect(() => {
    const id = window.setInterval(() => load({ silent: true }), 60000);
    return () => window.clearInterval(id);
  }, [load]);

  // Close on outside click / Escape.
  useEscape(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggleRead = async (n) => {
    setBusyId(n.id);
    const next = !n.is_read;
    try {
      await markNotificationRead(n.id, next);
      setNotifications((list) =>
        list.map((x) => (x.id === n.id ? { ...x, is_read: next, read_at: next ? x.read_at || new Date().toISOString() : null } : x))
      );
    } catch (err) {
      toast.error(err.message, 'Could not update notification');
    } finally {
      setBusyId(null);
    }
  };

  const markAll = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((list) => list.map((x) => ({ ...x, is_read: true, read_at: x.read_at || new Date().toISOString() })));
    } catch (err) {
      toast.error(err.message, 'Could not mark all read');
    }
  };

  const openOrder = async (n) => {
    // Reading it on open matches how order emails behave (arrival = seen).
    if (!n.is_read) {
      try {
        await markNotificationRead(n.id, true);
        setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true, read_at: x.read_at || new Date().toISOString() } : x)));
      } catch {
        /* non-fatal — the order still opens */
      }
    }
    setOpen(false);
    onOpenOrder?.(n.order_id);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-full border border-gold-500/25 text-cream-200 hover:border-gold-500/50 transition"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-burgundy-600 text-cream-100 text-[9px] font-black flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed md:absolute inset-x-3 md:inset-x-auto top-16 md:top-auto md:mt-2 md:right-0 md:w-96 z-50 rounded-2xl border border-gold-500/20 bg-night-900 shadow-2xl overflow-hidden" role="dialog" aria-label="Order notifications">
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gold-500/10">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-cream-100">New order alerts</h3>
              {unreadCount > 0 && <Badge tone="amber">{unreadCount} unread</Badge>}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => load()} className="w-7 h-7 flex items-center justify-center rounded-full text-cream-400 hover:text-gold-300" aria-label="Refresh notifications">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              {unreadCount > 0 && (
                <button onClick={markAll} className="text-[10px] font-bold text-gold-300 underline underline-offset-2 px-1">
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gold-500/5">
            {loading && (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            )}

            {!loading && error && (
              <div className="p-6 text-center">
                <p className="text-[11px] text-cream-500 leading-relaxed">{error}</p>
                <p className="text-[10px] text-cream-500/70 mt-1">
                  Run supabase/migrations/008_payments_notifications_settings.sql in the Supabase SQL Editor to enable alerts.
                </p>
                <Button variant="secondary" className="mt-3" onClick={() => load()}>Retry</Button>
              </div>
            )}

            {!loading && !error && notifications.length === 0 && (
              <div className="p-8 text-center">
                <Bell className="w-6 h-6 mx-auto text-cream-500/40" />
                <p className="mt-2 text-xs text-cream-500">No notifications yet.</p>
                <p className="text-[10px] text-cream-500/70 mt-0.5">New orders will ring the bell instantly.</p>
              </div>
            )}

            {!loading && !error && notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => openOrder(n)}
                className={`w-full text-left px-4 py-3 hover:bg-night-850/60 transition ${n.is_read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-cream-100">{n.title}</span>
                  <span className="text-[9px] text-cream-500 shrink-0">{timeAgo(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-1 text-[11px] text-cream-400 line-clamp-2">{n.body}</p>}
                <div className="mt-1.5 flex items-center gap-2">
                  {n.total != null && <span className="text-[10px] font-bold text-gold-300">₹{Number(n.total).toLocaleString('en-IN')}</span>}
                  {n.payment_method && <Badge tone="neutral">{n.payment_method}</Badge>}
                  <Badge tone={n.payment_status === 'Paid' ? 'green' : n.payment_status === 'Failed' ? 'red' : 'amber'}>
                    {n.payment_status}
                  </Badge>
                </div>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); toggleRead(n); }}
                  className="mt-2 inline-block text-[10px] font-bold text-cream-500 hover:text-gold-300 underline underline-offset-2"
                  disabled={busyId === n.id}
                >
                  {busyId === n.id ? 'Updating…' : n.is_read ? 'Mark unread' : 'Mark read'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationsBell;
