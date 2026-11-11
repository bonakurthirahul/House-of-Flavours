import { BrandLogo } from './BrandLogo.jsx';
import { Download, Printer } from './icons.jsx';
import { money, paymentMethodLabel, paymentStatusMeta } from '../lib/pricing.js';

// ------------------------------------------------------------------
// House of Flavours invoice (Phase 4 fix).
//
// ROOT CAUSE of the "white/unreadable invoice": the old modal card was
// `bg-white` nested inside a `text-cream-100` tree, so unstyled text
// inherited cream (#f8f2e7) on white. This component sets an explicit
// light background AND explicit dark text on every element, so the
// preview, the printout and the downloaded HTML are all readable.
//
// The downloaded HTML escapes every user-controlled value (name,
// phone, address, instructions, item names) — see escapeHtml().
// ------------------------------------------------------------------

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const num = (n) => Number(n || 0);
const feeLabel = (order) =>
  order.deliveryFee === 0
    ? 'FREE'
    : money(order.deliveryFee) +
      (order.deliveryDistanceKm != null ? ` (${order.deliveryDistanceKm} km @ ₹${order.deliveryRatePerKm}/km)` : '');

// ---- Standalone, print-ready HTML document (for the download button) ----
export function buildInvoiceHtml(order, info = {}) {
  const esc = escapeHtml;
  const brand = info.brandName || 'House of Flavours';
  const phone = info.phone || '';
  const email = info.email || '';
  const address = info.address || '';
  const gstin = info.gstRegistered && info.gstin ? info.gstin : '';
  const logo = info.logoUrl
    ? `<img src="${esc(info.logoUrl)}" alt="${esc(brand)} logo" style="height:56px;object-fit:contain" onerror="this.remove()" />`
    : '';
  const payMeta = paymentStatusMeta(order.paymentStatus);
  const payStatusLine =
    order.paymentStatus === 'Paid'
      ? '<strong style="color:#047857">Paid</strong>'
      : order.paymentStatus === 'Failed'
        ? '<strong style="color:#b91c1c">Failed</strong>'
        : '<strong style="color:#b45309">Pending</strong>';

  const gstRows =
    order.gstAmount > 0
      ? order.igst > 0
        ? `<tr><td>IGST (${(num(order.gstRate) * 100).toFixed(num(order.gstRate) * 100 % 1 === 0 ? 0 : 2)}%)</td><td class="r">${money(order.igst)}</td></tr>`
        : `<tr><td>CGST (${(num(order.gstRate) / 2 * 100).toFixed(num(order.gstRate) / 2 * 100 % 1 === 0 ? 0 : 2)}%)</td><td class="r">${money(order.cgst)}</td></tr>
           <tr><td>SGST (${(num(order.gstRate) / 2 * 100).toFixed(num(order.gstRate) / 2 * 100 % 1 === 0 ? 0 : 2)}%)</td><td class="r">${money(order.sgst)}</td></tr>`
      : '<tr><td>GST</td><td class="r">₹0 (not registered / not applicable)</td></tr>';

  const rows = (order.items || [])
    .map(
      (it) => `<tr>
        <td>${esc(it.name)}</td>
        <td class="r">${esc(it.quantity)}</td>
        <td class="r">${money(it.price)}</td>
        <td class="r">${money(num(it.price) * num(it.quantity))}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Invoice #${esc(order.orderId)} — ${esc(brand)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f4; color: #1c1917; margin: 0; padding: 24px; }
  .sheet { background: #ffffff; color: #1c1917; max-width: 720px; margin: 0 auto; border: 1px solid #e7e5e4; border-radius: 16px; overflow: hidden; }
  .head { display: flex; justify-content: space-between; gap: 16px; padding: 28px 32px; border-bottom: 3px solid #d4af37; }
  .brand { font-size: 22px; font-weight: 900; color: #b45309; margin: 6px 0 2px; }
  .sub { font-size: 12px; color: #78716c; line-height: 1.6; }
  .invoice-no { text-align: right; font-size: 12px; color: #78716c; line-height: 1.7; }
  .invoice-no b { color: #1c1917; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 20px 32px; font-size: 13px; }
  .grid h4 { margin: 0 0 6px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #a8a29e; }
  .grid p { margin: 2px 0; color: #44403c; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 0; font-size: 13px; }
  thead th { text-align: left; padding: 10px 32px; background: #fafaf9; border-top: 1px solid #e7e5e4; border-bottom: 1px solid #e7e5e4; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #57534e; }
  thead th.r, td.r { text-align: right; }
  tbody td { padding: 9px 32px; border-bottom: 1px solid #f5f5f4; color: #292524; }
  .totals { margin: 0; padding: 12px 32px 4px; width: 100%; border-collapse: collapse; font-size: 13px; }
  .totals td { padding: 6px 0; border-bottom: 1px solid #f5f5f4; color: #44403c; }
  .totals td.r { text-align: right; color: #1c1917; font-weight: 600; }
  .totals .disc td, .totals .disc td.r { color: #047857; }
  .totals .grand td { border-top: 2px solid #d4af37; border-bottom: none; font-size: 17px; font-weight: 900; color: #b45309; padding-top: 12px; }
  .pay { margin: 18px 32px 8px; padding: 14px 18px; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 12px; font-size: 12.5px; color: #44403c; line-height: 1.8; }
  .foot { text-align: center; font-size: 11.5px; color: #a8a29e; padding: 22px 32px 28px; line-height: 1.7; }
  .foot b { color: #78716c; }
  @media (max-width: 560px) { .head { flex-direction: column; } .invoice-no { text-align: left; } .grid { grid-template-columns: 1fr; } thead th, tbody td { padding-left: 16px; padding-right: 16px; } body { padding: 10px; } }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        ${logo}
        <div class="brand">${esc(brand)}</div>
        <div class="sub">${esc(address)}${phone ? ` · ${esc(phone)}` : ''}${email ? `<br>${esc(email)}` : ''}</div>
      </div>
      <div class="invoice-no">
        <b>Tax Invoice / Receipt</b><br>
        Invoice #: ${esc(order.orderId)}<br>
        Date: ${esc(order.timestamp || '')}<br>
        ${gstin ? `GSTIN: ${esc(gstin)}<br>` : ''}
      </div>
    </div>

    <div class="grid">
      <div>
        <h4>Billed to</h4>
        <p><b>${esc(order.customer?.name || 'Guest')}</b></p>
        <p>${esc(order.customer?.phone || '')}</p>
        <p>${esc(order.customer?.address || '')}</p>
        ${order.customer?.instructions ? `<p><i>Note: ${esc(order.customer.instructions)}</i></p>` : ''}
      </div>
      <div>
        <h4>Order</h4>
        <p>Order #: <b>${esc(order.orderId)}</b></p>
        <p>Order status: ${esc(order.status || 'Order Received')}</p>
        <p>Payment method: ${esc(paymentMethodLabel(order.paymentMethod, info.upiId))}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Line total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Food subtotal</td><td class="r">${money(order.subtotal)}</td></tr>
      ${order.discountAmount > 0 ? `<tr class="disc"><td>Discount${order.couponCode ? ` (${esc(order.couponCode)})` : ''}</td><td class="r">-${money(order.discountAmount)}</td></tr>` : ''}
      ${gstRows}
      <tr><td>Delivery charges</td><td class="r">${esc(feeLabel(order))}</td></tr>
      <tr class="grand"><td>Total payable</td><td class="r">${money(order.grandTotal)}</td></tr>
    </table>

    <div class="pay">
      Payment status: ${payStatusLine}<br>
      Order status: ${esc(order.status || 'Order Received')} · Payment method: ${esc(paymentMethodLabel(order.paymentMethod, info.upiId))}
    </div>

    <div class="foot">
      Thank you for ordering with <b>${esc(brand)}</b>!<br>
      ${esc(phone)}${phone && email ? ' · ' : ''}${esc(email)}${email || phone ? ' · ' : ''}${esc(address)}
    </div>
  </div>
</body>
</html>`;
}

// ---- In-app preview modal ----
function GstRow({ order }) {
  if (!(order.gstAmount > 0)) {
    return (
      <div className="flex justify-between text-stone-500">
        <span>GST</span>
        <span>₹0 (not registered / not applicable)</span>
      </div>
    );
  }
  const pct = (n) => `${(num(n) * 100).toFixed(num(n) * 100 % 1 === 0 ? 0 : 2)}%`;
  if (order.igst > 0) {
    return (
      <div className="flex justify-between">
        <span>IGST ({pct(order.gstRate)})</span>
        <span>{money(order.igst)}</span>
      </div>
    );
  }
  return (
    <>
      <div className="flex justify-between">
        <span>CGST ({pct(num(order.gstRate) / 2)})</span>
        <span>{money(order.cgst || 0)}</span>
      </div>
      <div className="flex justify-between">
        <span>SGST ({pct(num(order.gstRate) / 2)})</span>
        <span>{money(order.sgst || 0)}</span>
      </div>
    </>
  );
}

function PayBadge({ order }) {
  const meta = paymentStatusMeta(order.paymentStatus);
  const tones = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    neutral: 'bg-stone-50 text-stone-700 border-stone-200'
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${tones[meta.tone]}`}>
      {meta.label}
    </span>
  );
}

export function InvoiceModal({ order, info = {}, onClose, onDownload }) {
  if (!order) return null;
  const download = () => {
    const html = buildInvoiceHtml(order, info);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HouseOfFlavours_Invoice_${order.orderId}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onDownload?.();
  };

  const brand = info.brandName || 'House of Flavours';
  const showQr =
    /^upi/i.test(String(order.paymentMethod || '')) && order.paymentStatus !== 'Paid' && info.upiId;
  const qrSrc = info.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=${encodeURIComponent(info.upiId)}%26pn=${encodeURIComponent(brand)}%26am=${encodeURIComponent(order.grandTotal)}`
    : '';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 print:static print:bg-white print:p-0 print:block">
      <div
        id="printable-invoice"
        className="bg-white text-stone-900 p-5 sm:p-8 rounded-3xl max-w-md w-full shadow-2xl text-xs max-h-[92vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible print:rounded-none print:shadow-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Invoice for order ${order.orderId}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b-[3px] border-amber-500">
          <div className="min-w-0">
            {info.logoUrl ? (
              <img src={info.logoUrl} alt={`${brand} logo`} className="h-12 w-auto object-contain mb-1" />
            ) : (
              <BrandLogo className="w-12 h-12 mb-1" />
            )}
            <h3 className="text-base sm:text-lg font-black text-stone-900">{brand}</h3>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              {info.address || '—'}
              {info.phone ? ` · ${info.phone}` : ''}
              {info.email ? ` · ${info.email}` : ''}
            </p>
            {info.gstRegistered && info.gstin ? (
              <p className="text-[10px] text-stone-500 mt-0.5">GSTIN: {info.gstin}</p>
            ) : null}
          </div>
          <div className="text-right shrink-0">
            <p className="font-black text-stone-800 text-[13px]">Tax Invoice / Receipt</p>
            <p className="text-[10px] text-stone-500 mt-1">Invoice #: <span className="font-bold text-stone-700">{order.orderId}</span></p>
            <p className="text-[10px] text-stone-500">{order.timestamp}</p>
          </div>
        </div>

        {/* Customer + order */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4 border-b border-stone-100">
          <div>
            <h4 className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400 mb-1">Billed to</h4>
            <p className="font-bold text-stone-800">{order.customer?.name || 'Guest'}</p>
            <p className="text-stone-600">{order.customer?.phone || ''}</p>
            <p className="text-stone-600 break-words">{order.customer?.address || ''}</p>
            {order.customer?.instructions ? (
              <p className="text-stone-500 italic mt-1">Note: {order.customer.instructions}</p>
            ) : null}
          </div>
          <div>
            <h4 className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400 mb-1">Order</h4>
            <p className="text-stone-700">Order #: <span className="font-bold">{order.orderId}</span></p>
            <p className="mt-1 flex items-center gap-1.5 flex-wrap">
              <PayBadge order={order} />
            </p>
            <p className="text-stone-600 mt-1">{paymentMethodLabel(order.paymentMethod, info.upiId)}</p>
            <p className="text-stone-600">Status: {order.status || 'Order Received'}</p>
          </div>
        </div>

        {/* Items */}
        <table className="w-full my-2 text-xs">
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-stone-400 border-y border-stone-100">
              <th className="text-left py-2 font-bold">Item</th>
              <th className="text-right py-2 font-bold">Qty</th>
              <th className="text-right py-2 font-bold">Unit</th>
              <th className="text-right py-2 font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {(order.items || []).map((it, idx) => (
              <tr key={`${it.menuId || it.id || it.name}-${idx}`} className="text-stone-800">
                <td className="py-2 pr-2">{it.name}</td>
                <td className="py-2 text-right text-stone-600">{it.quantity}</td>
                <td className="py-2 text-right text-stone-600">{money(it.price)}</td>
                <td className="py-2 text-right font-bold">{money(num(it.price) * num(it.quantity))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="space-y-1.5 pt-2 pb-1 text-[11.5px] text-stone-600">
          <div className="flex justify-between"><span>Food subtotal</span><span className="font-semibold text-stone-800">{money(order.subtotal)}</span></div>
          {order.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
              <span className="font-semibold">-{money(order.discountAmount)}</span>
            </div>
          )}
          <GstRow order={order} />
          <div className="flex justify-between">
            <span>Delivery charges</span>
            <span className="font-semibold text-stone-800">{feeLabel(order)}</span>
          </div>
          <div className="flex justify-between items-center pt-2.5 mt-1 border-t-2 border-amber-500">
            <span className="font-black text-stone-900 text-[13px]">Total payable</span>
            <span className="font-black text-amber-700 text-lg">{money(order.grandTotal)}</span>
          </div>
        </div>

        {/* Payment note (never implies the QR alone proves payment) */}
        <div className="mt-3 mb-1 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-[11px] text-stone-600 leading-relaxed">
          <span className="font-bold text-stone-800">Payment:</span>{' '}
          {paymentMethodLabel(order.paymentMethod, info.upiId)} ·{' '}
          {order.paymentStatus === 'Paid'
            ? <span className="font-bold text-emerald-700">Paid</span>
            : order.paymentStatus === 'Failed'
              ? <span className="font-bold text-rose-700">Failed</span>
              : <span className="font-bold text-amber-700">Pending</span>}
          {showQr && (
            <span className="block mt-2 text-center">
              <img src={qrSrc} alt="UPI QR code" className="w-28 h-28 mx-auto border rounded-lg p-1 bg-white" />
              <span className="block text-[10px] text-stone-500 mt-1">
                Scan to pay {money(order.grandTotal)} to <span className="font-bold text-stone-700">{info.upiId}</span>.
              </span>
            </span>
          )}
        </div>

        {/* Actions — hidden when printing */}
        <div className="flex gap-2 mt-4 print:hidden">
          <button
            onClick={download}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition"
          >
            <Download className="w-4 h-4" /> Download Invoice
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 transition"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={onClose} className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default InvoiceModal;
