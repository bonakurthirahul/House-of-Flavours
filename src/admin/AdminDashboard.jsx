import { useCallback, useEffect, useState } from 'react';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { ShieldCheck, RefreshCw } from '../components/icons.jsx';
import { loadOrdersFromDb, updateOrderStatus, deleteOrder, subscribeToOrders } from '../lib/dbService.js';
import { Badge, Skeleton, Spinner, useToast } from './ui.jsx';
import { Overview } from './sections/Overview.jsx';
import { LiveOrders } from './sections/LiveOrders.jsx';
import { MenuManager } from './sections/MenuManager.jsx';
import { Categories } from './sections/Categories.jsx';
import { OrdersHistory } from './sections/OrdersHistory.jsx';
import { Messages } from './sections/Messages.jsx';
import { Settings } from './sections/Settings.jsx';

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'live', label: 'Live Orders' },
  { id: 'menu', label: 'Menu' },
  { id: 'categories', label: 'Categories' },
  { id: 'history', label: 'Orders & Customers' },
  { id: 'messages', label: 'Messages' },
  { id: 'settings', label: 'Settings' }
];

// Valid forward transitions for staff. Managers may override.
const TRANSITIONS = {
  'Order Received': ['Preparing', 'Cancelled'],
  Preparing: ['Out for Delivery', 'Cancelled'],
  'Out for Delivery': ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: []
};

export function AdminDashboard({ session }) {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingIds, setUpdatingIds] = useState(() => new Set());
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const [realtimeOk, setRealtimeOk] = useState(true);

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const rows = await loadOrdersFromDb({ limit: 500 });
      setOrders(rows);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Realtime: refresh the list when orders change. Cleaned up on unmount.
  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToOrders(() => loadOrders({ silent: true }));
    } catch {
      setRealtimeOk(false);
    }
    return () => unsubscribe();
  }, [loadOrders]);

  const setStatus = useCallback(async (orderId, status) => {
    const current = orders.find((o) => o.order_id === orderId);
    if (!current) return;
    if (status === current.status) return;

    const allowed = TRANSITIONS[current.status] || [];
    if (!session.isManager && !allowed.includes(status)) {
      toast.error(`“${current.status}” cannot move to “${status}”.`, 'Invalid transition');
      return;
    }

    setUpdatingIds((prev) => new Set(prev).add(orderId));
    const previous = current.status;
    setOrders((list) => list.map((o) => (o.order_id === orderId ? { ...o, status } : o)));

    try {
      await updateOrderStatus(orderId, status);
      toast.success(`Order #${orderId} → ${status}.`);
    } catch (err) {
      setOrders((list) => list.map((o) => (o.order_id === orderId ? { ...o, status: previous } : o)));
      toast.error(err.message, 'Could not update status');
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }, [orders, session.isManager, toast]);

  // Permanent deletion goes through the staff-only delete_order RPC, which
  // re-checks authorization and that the order is Delivered/Cancelled.
  const deleteOrderRow = useCallback(async (orderId) => {
    setDeletingIds((prev) => new Set(prev).add(orderId));
    try {
      await deleteOrder(orderId);
      setOrders((list) => list.filter((o) => o.order_id !== orderId));
      toast.success(`Order #${orderId} deleted.`);
    } catch (err) {
      toast.error(err.message || 'Could not delete order.', 'Delete failed');
      throw err;
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }, [toast]);

  const pendingCount = orders.filter((o) => ['Order Received', 'Preparing', 'Out for Delivery'].includes(o.status)).length;

  return (
    <div className="min-h-screen bg-night-950 text-cream-100 lg:flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-night-900 border-r border-gold-500/10 flex flex-col transition-transform lg:static lg:translate-x-0 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-gold-500/10 flex items-center gap-3">
          <BrandLogo className="w-11 h-11" />
          <div className="min-w-0">
            <div className="font-display text-lg font-bold text-cream-100 leading-none">House of <span className="text-gradient-gold">Flavours</span></div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-cream-500 mt-1">Admin</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => { setTab(item.id); setMobileNavOpen(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition ${tab === item.id ? 'bg-gradient-to-r from-gold-300/20 to-transparent text-gold-200 border border-gold-500/25' : 'text-cream-300 hover:bg-night-850 hover:text-cream-100 border border-transparent'}`}
            >
              <span className="flex items-center gap-3">
                <span className={`w-1.5 h-1.5 rounded-full ${tab === item.id ? 'bg-gold-400' : 'bg-night-600'}`} />
                {item.label}
              </span>
              {item.id === 'live' && pendingCount > 0 && <Badge tone="amber">{pendingCount}</Badge>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gold-500/10">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-night-950 font-bold text-sm flex items-center justify-center">
              {(session.user?.name || 'S').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-cream-100 truncate">{session.user?.name}</div>
              <div className="text-[10px] text-cream-500 truncate">{session.user?.email}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={session.isManager ? 'gold' : 'violet'}>
              <ShieldCheck className="w-3 h-3" /> {session.isManager ? 'Manager' : 'Staff'}
            </Badge>
            {!realtimeOk && <Badge tone="red">Realtime off</Badge>}
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileNavOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />}

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 glass border-b border-gold-500/10">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
            <button onClick={() => setMobileNavOpen((o) => !o)} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full border border-gold-500/25 text-cream-200" aria-label="Toggle navigation" aria-expanded={mobileNavOpen}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            <div className="hidden sm:block text-xs text-cream-500">
              Signed in as <span className="text-cream-200 font-semibold">{session.user?.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {!realtimeOk && (
                <button onClick={() => loadOrders()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border border-gold-500/20 text-cream-300 hover:border-gold-500/50">
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              )}
              <a
                href="/"
                onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }}
                className="px-3 py-2 rounded-full text-xs font-bold border border-gold-500/20 text-cream-300 hover:border-gold-500/50"
              >
                View site
              </a>
              <button
                onClick={async () => { await session.signOut(); window.history.pushState({}, '', '/admin/login'); window.dispatchEvent(new PopStateEvent('popstate')); }}
                className="px-3 py-2 rounded-full text-xs font-bold bg-burgundy-600 text-cream-100 hover:bg-burgundy-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {tab === 'overview' && (
            <Overview
              orders={orders}
              loading={loading && orders.length === 0}
              error={error}
              onRefresh={() => loadOrders()}
              onDelete={deleteOrderRow}
              deletingIds={deletingIds}
              canDelete={session.isStaff}
            />
          )}
          {tab === 'live' && (
            <LiveOrders
              orders={orders.filter((o) => o.status !== 'Cancelled' && o.status !== 'Delivered')}
              loading={loading && orders.length === 0}
              error={error}
              onRefresh={() => loadOrders()}
              onSetStatus={setStatus}
              updatingIds={updatingIds}
            />
          )}
          {tab === 'menu' && <MenuManager isManager={session.isManager} />}
          {tab === 'categories' && <Categories isManager={session.isManager} />}
          {tab === 'history' && (
            <OrdersHistory
              orders={orders}
              loading={loading && orders.length === 0}
              error={error}
              onDelete={deleteOrderRow}
              deletingIds={deletingIds}
              canDelete={session.isStaff}
            />
          )}
          {tab === 'messages' && <Messages isManager={session.isManager} />}
          {tab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}
