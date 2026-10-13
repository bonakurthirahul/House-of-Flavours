import { useMemo, useState } from 'react';
import { StatusBadge, Skeleton, Button, Badge, ConfirmDialog } from '../ui.jsx';
import { RefreshCw } from '../../components/icons.jsx';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Only these terminal statuses may be permanently deleted (mirrors the
// staff-only delete_order RPC, which re-checks the live status server-side).
const DELETABLE_STATUSES = ['Delivered', 'Cancelled'];

function StatCard({ label, value, hint, tone = 'gold' }) {
  const tones = {
    gold: 'text-gradient-gold',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-burgundy-400'
  };
  return (
    <div className="glass rounded-2xl p-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-cream-500">{label}</div>
      <div className={`mt-2 font-display text-3xl font-bold ${tones[tone] || tones.gold}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-cream-500">{hint}</div>}
    </div>
  );
}

export function Overview({ orders, loading, error, onRefresh, onDelete, deletingIds, canDelete = false }) {
  const [confirmTarget, setConfirmTarget] = useState(null);

  const handleDelete = async () => {
    if (!confirmTarget || typeof onDelete !== 'function') return;
    try {
      await onDelete(confirmTarget.order_id);
      setConfirmTarget(null);
    } catch {
      // The parent surfaces the error via a toast; keep the dialog open so the
      // operator can retry or cancel.
    }
  };

  const stats = useMemo(() => {
    const list = orders || [];
    const nonCancelled = list.filter((o) => o.status !== 'Cancelled');
    return {
      total: list.length,
      pending: list.filter((o) => ['Order Received', 'Preparing', 'Out for Delivery'].includes(o.status)).length,
      delivered: list.filter((o) => o.status === 'Delivered').length,
      cancelled: list.filter((o) => o.status === 'Cancelled').length,
      revenue: nonCancelled.reduce((s, o) => s + Number(o.total || 0), 0),
      deliveredRevenue: list.filter((o) => o.status === 'Delivered').reduce((s, o) => s + Number(o.total || 0), 0)
    };
  }, [orders]);

  const recent = (orders || []).slice(0, 6);
  const closed = (orders || []).filter((o) => DELETABLE_STATUSES.includes(o.status));

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Overview</h2>
          <p className="text-xs text-cream-500 mt-0.5">Revenue excludes cancelled orders. Delivered figure is settled revenue.</p>
        </div>
        <Button variant="secondary" onClick={onRefresh}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {error && <div className="rounded-2xl border border-burgundy-400/40 bg-burgundy-600/15 p-4 text-xs text-burgundy-400">{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orders" value={stats.total} hint="Last 500 loaded" />
        <StatCard label="Pending" value={stats.pending} tone="amber" hint="Received · Preparing · Out for delivery" />
        <StatCard label="Completed" value={stats.delivered} tone="green" hint={`${stats.cancelled} cancelled`} />
        <StatCard label="Revenue" value={money(stats.revenue)} tone="gold" hint={`${money(stats.deliveredRevenue)} delivered`} />
      </div>

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-bold text-cream-100">Recent Orders</h3>
        {recent.length === 0 ? (
          <p className="mt-3 text-xs text-cream-500">No orders yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-gold-500/10">
            {recent.map((o) => (
              <div key={o.order_id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-cream-100">#{o.order_id}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-[11px] text-cream-500 truncate mt-0.5">
                    {o.customer_name} · {o.phone} · {new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </div>
                </div>
                <div className="text-sm font-bold text-gold-300 shrink-0">{money(o.total)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed / Cancelled orders — the only orders eligible for deletion. */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-cream-100">Completed / Cancelled Orders</h3>
          <Badge tone={closed.length > 0 ? 'gold' : 'neutral'}>{closed.length}</Badge>
        </div>
        <p className="mt-1 text-[11px] text-cream-500">
          {canDelete
            ? 'Only Delivered or Cancelled orders can be permanently deleted.'
            : 'Delivered and Cancelled orders. Deletion requires staff access.'}
        </p>

        {closed.length === 0 ? (
          <p className="mt-3 text-xs text-cream-500">No completed or cancelled orders.</p>
        ) : (
          <div className="mt-4 divide-y divide-gold-500/10">
            {closed.map((o) => {
              const busy = Boolean(deletingIds?.has?.(o.order_id));
              return (
                <div key={o.order_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-cream-100">#{o.order_id}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <div className="text-[11px] text-cream-500 truncate mt-0.5">
                      {o.customer_name} · {o.phone} · {new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-sm font-bold text-gold-300">{money(o.total)}</div>
                    {canDelete && (
                      <Button
                        variant="danger"
                        loading={busy}
                        disabled={busy}
                        onClick={() => setConfirmTarget(o)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete order"
        message={confirmTarget ? `Permanently delete order #${confirmTarget.order_id} (${confirmTarget.status})? This removes its line items too and cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={Boolean(confirmTarget && deletingIds?.has?.(confirmTarget.order_id))}
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
