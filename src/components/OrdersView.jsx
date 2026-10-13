import { statusMeta, money } from '../lib/pricing.js';
import { Download, RefreshCw, ShoppingBag, MapPin } from './icons.jsx';

// Customer-facing order history. Pure presentation: it renders the mapped order
// shape produced by App (Supabase order_items -> { menuId, name, quantity,
// price }) merged with any just-placed session orders.
const STEPS = ['Order Received', 'Preparing', 'Out for Delivery', 'Delivered'];

const TONE_BADGE = {
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  gold: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  red: 'bg-rose-100 text-rose-800 border-rose-200',
  neutral: 'bg-stone-100 text-stone-700 border-stone-200'
};

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${TONE_BADGE[meta.tone] || TONE_BADGE.neutral}`}>
      {meta.cancelled ? '✕ ' : ''}{meta.label}
    </span>
  );
}

function Timeline({ status }) {
  if (status === 'Cancelled') {
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">
        This order was cancelled.
      </div>
    );
  }
  const currentStep = statusMeta(status).step;
  return (
    <ol className="mt-3 flex items-center gap-1" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = i <= currentStep;
        return (
          <li key={step} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-center">
              <span className={`h-1 flex-1 rounded-full ${i === 0 ? 'bg-transparent' : done ? 'bg-emerald-500' : 'bg-stone-200'}`} />
              <span className={`w-3 h-3 rounded-full border-2 ${done ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-stone-300'}`} />
              <span className={`h-1 flex-1 rounded-full ${i === STEPS.length - 1 ? 'bg-transparent' : i < currentStep ? 'bg-emerald-500' : 'bg-stone-200'}`} />
            </div>
            <span className={`text-[9px] text-center leading-tight ${done ? 'text-emerald-700 font-bold' : 'text-stone-400'}`}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

function OrderCard({ order, menuById, onViewInvoice }) {
  const cancelled = order.status === 'Cancelled';
  return (
    <article className={`bg-white rounded-2xl border p-3.5 sm:p-4 text-xs shadow-sm ${cancelled ? 'border-rose-200' : 'border-stone-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-stone-900">#{order.orderId}</span>
            <StatusBadge status={order.status} />
          </div>
          <div className="text-[10px] text-stone-400 mt-0.5">{order.timestamp}</div>
        </div>
        <div className="text-right">
          <div className="font-black text-sm text-stone-900">{money(order.grandTotal)}</div>
          <div className="text-[10px] text-stone-400">{order.paymentMethod} · {order.paymentStatus || 'Pending'}</div>
        </div>
      </div>

      <Timeline status={order.status} />

      <div className="mt-3 divide-y divide-stone-100">
        {order.items.map((it, idx) => {
          const img = it.image || menuById?.[it.menuId]?.image || menuById?.[it.id]?.image;
          return (
            <div key={`${it.menuId || it.id || it.name}-${idx}`} className="py-2 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-stone-100 overflow-hidden shrink-0 flex items-center justify-center">
                {img
                  ? <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <ShoppingBag className="w-4 h-4 text-stone-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-stone-800 truncate">{it.name}</div>
                <div className="text-[10px] text-stone-400">₹{it.price} × {it.quantity}</div>
              </div>
              <div className="font-bold text-stone-700 shrink-0">{money(Number(it.price) * it.quantity)}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-stone-100 space-y-1 text-[11px] text-stone-500">
        <div className="flex justify-between"><span>Subtotal</span><span>₹{order.subtotal}</span></div>
        {order.discountAmount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>-₹{order.discountAmount}</span></div>}
        {order.gstAmount > 0 && <div className="flex justify-between"><span>GST</span><span>₹{order.gstAmount}</span></div>}
        <div className="flex justify-between"><span>Delivery</span><span>{order.deliveryFee === 0 ? 'FREE' : `₹${order.deliveryFee}`}</span></div>
        <div className="flex justify-between font-black text-stone-900 text-xs pt-1"><span>Total</span><span>{money(order.grandTotal)}</span></div>
      </div>

      {order.customer?.address && (
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-stone-400">
          <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{order.customer.address}</span>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button onClick={() => onViewInvoice(order)} className="text-amber-700 font-bold underline flex items-center gap-1 text-[11px]">
          <Download className="w-3.5 h-3.5" /> View invoice
        </button>
      </div>
    </article>
  );
}

export function OrdersView({ orders = [], currentUser, loading, error, onRefresh, onLogin, onViewInvoice, menuById }) {
  return (
    <main className="flex-1 max-w-2xl w-full mx-auto p-3.5 sm:p-6 bg-stone-100 text-stone-900">
      <div className="flex justify-between items-center mb-3 sm:mb-4 gap-2">
        <h2 className="text-lg sm:text-xl font-black">My Orders</h2>
        <div className="flex items-center gap-2">
          {currentUser ? (
            <button onClick={onRefresh} className="text-xs font-bold text-stone-600 hover:text-stone-900 flex items-center gap-1" disabled={loading}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          ) : (
            <button onClick={onLogin} className="text-xs font-bold text-amber-700 underline">Log in</button>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-200 p-4 animate-pulse">
              <div className="h-4 w-32 bg-stone-200 rounded mb-3" />
              <div className="h-3 w-24 bg-stone-100 rounded mb-3" />
              <div className="h-10 bg-stone-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-700">
          <p className="font-semibold">{error}</p>
          <button onClick={onRefresh} className="mt-2 font-bold underline">Try again</button>
        </div>
      )}

      {!loading && !error && (!currentUser || orders.length === 0) && (
        <div className="bg-white p-8 rounded-2xl text-center text-xs text-stone-400 border border-stone-200">
          {currentUser
            ? `No orders yet, ${currentUser.name || currentUser.username}. Your placed orders will appear here.`
            : 'Log in to view your order history.'}
        </div>
      )}

      {!loading && !error && currentUser && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((o) => <OrderCard key={o.orderId} order={o} menuById={menuById} onViewInvoice={onViewInvoice} />)}
        </div>
      )}
    </main>
  );
}

export default OrdersView;
