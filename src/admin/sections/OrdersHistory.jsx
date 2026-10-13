import { useMemo, useState } from 'react';
import { StatusBadge, EmptyState, Skeleton, Button, ConfirmDialog } from '../ui.jsx';

const ALL_STATUSES = ['All', 'Order Received', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
const DELETABLE_STATUSES = ['Delivered', 'Cancelled'];
const PAGE_SIZE = 10;
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export function OrdersHistory({ orders, loading, error, onDelete, deletingIds, canDelete = false }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const handleDelete = async () => {
    if (!confirmTarget || typeof onDelete !== 'function') return;
    try {
      await onDelete(confirmTarget.order_id);
      setConfirmTarget(null);
    } catch {
      // deleteOrderRow already surfaced the error via a toast.
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (orders || []).filter((o) => {
      const matchStatus = status === 'All' || o.status === status;
      const matchQuery = !q ||
        String(o.order_id || '').toLowerCase().includes(q) ||
        String(o.customer_name || '').toLowerCase().includes(q) ||
        String(o.phone || '').toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [orders, query, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-cream-100">Orders & Customers</h2>
        <p className="text-xs text-cream-500 mt-0.5">Search by order id, name or phone. Customer data shown is limited to what the order records.</p>
      </div>

      {error && <div className="rounded-2xl border border-burgundy-400/40 bg-burgundy-600/15 p-4 text-xs text-burgundy-400">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          placeholder="Search orders…"
          className="flex-1 px-4 py-2.5 text-sm bg-night-850 border border-gold-500/15 rounded-full outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
          aria-label="Search orders"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-4 py-2.5 text-sm bg-night-850 border border-gold-500/15 rounded-full outline-none text-cream-100 focus:border-gold-500/50"
          aria-label="Filter by status"
        >
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {pageRows.length === 0 ? (
        <EmptyState title="No matching orders" hint="Try a different search or status filter." />
      ) : (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-night-850/70 text-cream-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3 font-bold">Order</th>
                  <th className="px-4 py-3 font-bold">Customer</th>
                  <th className="px-4 py-3 font-bold">Items</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Total</th>
                  {canDelete && <th className="px-4 py-3 font-bold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gold-500/10">
                {pageRows.map((o) => (
                  <tr key={o.order_id} className="hover:bg-gold-500/5 transition">
                    <td className="px-4 py-3">
                      <div className="font-bold text-cream-100">#{o.order_id}</div>
                      <div className="text-[10px] text-cream-500">{new Date(o.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-cream-200">{o.customer_name}</div>
                      <div className="text-[10px] text-cream-500">{o.phone}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="text-cream-400 line-clamp-2">{o.items_summary}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-right font-bold text-gold-300">{money(o.total)}</td>
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        {DELETABLE_STATUSES.includes(o.status) ? (
                          <Button
                            variant="danger"
                            loading={deletingIds?.has?.(o.order_id)}
                            disabled={deletingIds?.has?.(o.order_id)}
                            onClick={() => setConfirmTarget(o)}
                          >
                            Delete
                          </Button>
                        ) : (
                          <span className="text-[10px] text-cream-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gold-500/10">
            <span className="text-[11px] text-cream-500">
              {filtered.length} order{filtered.length === 1 ? '' : 's'} · page {safePage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>Prev</Button>
              <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Next</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete order"
        message={confirmTarget ? `Permanently delete order #${confirmTarget.order_id}? This removes its line items too and cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={Boolean(confirmTarget && deletingIds?.has?.(confirmTarget.order_id))}
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
