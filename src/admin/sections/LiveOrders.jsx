import { useState } from 'react';
import { StatusBadge, Badge, Button, EmptyState, Skeleton } from '../ui.jsx';
import { RefreshCw } from '../../components/icons.jsx';

const ALL_STATUSES = ['Order Received', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function LiveOrders({ orders, loading, error, onRefresh, onSetStatus, updatingIds }) {
  const [expanded, setExpanded] = useState({});

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Live Orders</h2>
          <p className="text-xs text-cream-500 mt-0.5">Updates in real time (falls back to refresh if realtime is unavailable).</p>
        </div>
        <Button variant="secondary" onClick={onRefresh}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {error && <div className="rounded-2xl border border-burgundy-400/40 bg-burgundy-600/15 p-4 text-xs text-burgundy-400">{error}</div>}

      {orders.length === 0 ? (
        <EmptyState title="No orders yet" hint="New orders will appear here the moment customers check out." />
      ) : (
        orders.map((o) => {
          const items = o.order_items || [];
          const isOpen = expanded[o.order_id];
          const updating = updatingIds.has(o.order_id);
          return (
            <div key={o.order_id} className="glass rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-cream-100">#{o.order_id}</span>
                    <StatusBadge status={o.status} />
                    <Badge tone="neutral">{o.payment_method}</Badge>
                    <span className="text-[10px] text-cream-500">{new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                  </div>
                  <div className="mt-2 text-xs text-cream-300">
                    <span className="font-semibold text-cream-100">{o.customer_name}</span>
                    {' · '}
                    <span className="text-gold-300 font-bold">{o.phone}</span>
                  </div>
                  <div className="text-[11px] text-cream-500 mt-0.5">{o.address}</div>
                  {o.instructions && <div className="text-[11px] text-gold-300 mt-1">Note: “{o.instructions}”</div>}

                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [o.order_id]: !prev[o.order_id] }))}
                    className="mt-2 text-[11px] font-bold text-gold-300 underline underline-offset-4"
                    aria-expanded={!!isOpen}
                  >
                    {isOpen ? 'Hide items' : `Show items (${items.length})`}
                  </button>
                  {isOpen && (
                    <div className="mt-2 rounded-xl border border-gold-500/10 bg-night-850/60 p-3 space-y-1">
                      {items.map((it) => (
                        <div key={it.id} className="flex justify-between text-[11px] text-cream-300">
                          <span>{it.name} × {it.quantity}</span>
                          <span>{money(Number(it.price) * it.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between gap-3 md:min-w-[170px]">
                  <div className="text-right">
                    <div className="text-lg font-bold text-gold-300">{money(o.total)}</div>
                    <div className="text-[10px] text-cream-500">incl. GST {money(o.gst)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`status-${o.order_id}`}>Order status</label>
                    <select
                      id={`status-${o.order_id}`}
                      value={o.status}
                      disabled={updating}
                      onChange={(e) => onSetStatus(o.order_id, e.target.value)}
                      className="px-3 py-2 rounded-xl border border-gold-500/20 bg-night-850 text-cream-100 text-xs font-semibold outline-none focus:border-gold-500/50 disabled:opacity-60"
                    >
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
