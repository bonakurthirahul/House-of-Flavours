// ==================================================================
// House of Flavours — single source of truth for GST + delivery pricing.
//
// IMPORTANT (tax): the defaults below do NOT levy GST. The business's GST
// registration status and place-of-supply treatment must be confirmed by the
// owner/accountant before enabling. Set `gst_registered=true` (and, if the
// applicable rate differs from 5%, `gst_rate`) in the database app_settings
// (Admin → Settings) to begin charging. Nothing here asserts legal compliance.
//
// IMPORTANT (delivery): the ₹50/km Ghanapur rule is only used when
// `delivery_mode = 'distance'` AND the delivery origin + a verifiable road
// distance source (owner-defined delivery zones, or a routing provider wired
// into the database) are configured. Until then the safe flat rule is used.
// The client never supplies the authoritative distance/fee — the database
// recomputes both in public.place_order().
// ==================================================================

// Confirmed delivery origin (Ghanapuram). These coordinates are also stored
// server-side in public.app_settings; the server remains authoritative for any
// distance-based fee. They are not secret (see the public Google Maps link).
export const DELIVERY_ORIGIN = { lat: 17.429889, lng: 78.687861 };

export const DEFAULT_PRICING_SETTINGS = {
  // --- GST ---
  gstRegistered: false,     // do not collect until the owner confirms registration
  gstRate: 0.05,            // 5% (restaurant service, no ITC) — configurable
  gstSplit: 'cgst_sgst',    // 'cgst_sgst' (intra-state) | 'igst' (inter-state)
  gstOnDelivery: false,     // whether the delivery charge forms part of taxable value
  gstin: '',                // never invented; shown only if the owner sets it

  // --- Delivery ---
  deliveryMode: 'flat',     // 'flat' | 'distance' (distance stays OFF until routing is configured)
  deliveryFlatFee: 35,
  deliveryFreeThreshold: 499,
  deliveryRatePerKm: 50,    // ₹50 / km from Ghanapuram (used only in 'distance' mode)
  deliveryOriginLabel: 'Ghanapuram'
};

// Decimal-safe round to 2 places (avoids float drift like 0.1+0.2).
export const round2 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

const toBool = (v, fallback) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  return /^(true|1|yes|on)$/i.test(String(v).trim());
};

const toNum = (v, fallback) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

// Normalise the flat key/value object returned by get_public_settings() (or a
// raw app_settings map). Accepts rates as either 5 or 0.05.
export function normalizeSettings(raw = {}) {
  const d = DEFAULT_PRICING_SETTINGS;
  let rate = toNum(raw.gst_rate, d.gstRate);
  if (rate > 1) rate = rate / 100;
  const split = raw.gst_split === 'igst' ? 'igst' : 'cgst_sgst';
  return {
    gstRegistered: toBool(raw.gst_registered, d.gstRegistered),
    gstRate: Math.max(0, rate),
    gstSplit: split,
    gstOnDelivery: toBool(raw.gst_on_delivery, d.gstOnDelivery),
    gstin: raw.gstin == null ? '' : String(raw.gstin),
    deliveryMode: raw.delivery_mode === 'distance' ? 'distance' : 'flat',
    deliveryFlatFee: Math.max(0, toNum(raw.delivery_flat_fee, d.deliveryFlatFee)),
    deliveryFreeThreshold: Math.max(0, toNum(raw.delivery_free_threshold, d.deliveryFreeThreshold)),
    deliveryRatePerKm: Math.max(0, toNum(raw.delivery_rate_per_km, d.deliveryRatePerKm)),
    deliveryOriginLabel: raw.delivery_origin_label == null ? '' : String(raw.delivery_origin_label)
  };
}

// ------------------------------------------------------------------
// Editable site information (Admin → Settings, stored in app_settings
// and exposed through get_public_settings()). All values are
// public-safe business info already shown on the website — never a
// secret. Missing keys fall back to the confirmed values in config.js.
// ------------------------------------------------------------------
const cleanStr = (v, fallback = '') => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || fallback;
};

export function normalizeSiteInfo(raw = {}, fallback = {}) {
  const methodsRaw = cleanStr(raw.payment_methods, 'UPI,COD');
  const methods = methodsRaw
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m === 'UPI' || m === 'COD');
  if (!methods.length) methods.push('UPI', 'COD');
  return {
    brandName: cleanStr(raw.restaurant_name, fallback.brandName || 'House of Flavours'),
    phone: cleanStr(raw.restaurant_phone, fallback.phone || ''),
    email: cleanStr(raw.restaurant_email, fallback.email || ''),
    address: cleanStr(raw.restaurant_address, fallback.address || ''),
    hours: cleanStr(raw.restaurant_hours, fallback.hours || ''),
    logoUrl: cleanStr(raw.restaurant_logo_url, fallback.logoUrl || ''),
    upiId: cleanStr(raw.upi_id, fallback.upiId || ''),
    paymentMethods: methods
  };
}

// ------------------------------------------------------------------
// Payment status (kept separate from order fulfilment status).
// 'Paid' can only ever be set by staff through the trusted
// set_order_payment_status() database function — never by the browser.
// ------------------------------------------------------------------
export const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed'];

export const PAYMENT_STATUS_META = {
  Pending: { label: 'Pending', hint: 'Payment not verified yet', tone: 'amber' },
  Paid: { label: 'Paid', hint: 'Verified by the kitchen', tone: 'green' },
  Failed: { label: 'Failed', hint: 'Payment did not go through', tone: 'red' }
};

export function paymentStatusMeta(status) {
  return PAYMENT_STATUS_META[status] || { label: status || 'Pending', hint: '', tone: 'neutral' };
}

// Friendly label for both canonical ('UPI'/'COD') and legacy stored
// labels ('UPI Instant (9948099296@fam)', 'Cash on Delivery (COD)').
export function paymentMethodLabel(method, upiId = '') {
  const m = String(method || '').trim();
  if (/^upi/i.test(m)) return upiId ? `UPI (${upiId})` : 'UPI';
  if (/^cod/i.test(m) || /^cash on delivery/i.test(m)) return 'Cash on Delivery';
  return m || '—';
}

// Delivery fee. `distanceKm` MUST come from a verified source; when it is
// missing in distance mode we refuse to guess and report DISTANCE_UNVERIFIED.
export function computeDelivery({ subtotal = 0, distanceKm = null, settings = DEFAULT_PRICING_SETTINGS } = {}) {
  if (settings.deliveryMode === 'distance') {
    const d = Number(distanceKm);
    const hasDistance = distanceKm !== null && distanceKm !== undefined && distanceKm !== ''
      && Number.isFinite(d) && d >= 0;
    if (!hasDistance) {
      return { ok: false, mode: 'distance', fee: 0, distanceKm: null, rate: settings.deliveryRatePerKm, reason: 'DISTANCE_UNVERIFIED' };
    }
    return {
      ok: true, mode: 'distance',
      fee: round2(d * settings.deliveryRatePerKm),
      distanceKm: round2(d),
      rate: settings.deliveryRatePerKm,
      reason: null
    };
  }
  const free = subtotal >= settings.deliveryFreeThreshold || subtotal === 0;
  return {
    ok: true, mode: 'flat',
    fee: free ? 0 : round2(settings.deliveryFlatFee),
    distanceKm: null,
    rate: null,
    free,
    reason: null
  };
}

// Full, order-level breakdown. This mirrors public.place_order(); the database
// value is authoritative for stored orders.
export function computeOrderTotals({ subtotal = 0, discount = 0, distanceKm = null, settings = DEFAULT_PRICING_SETTINGS } = {}) {
  const sub = round2(Math.max(0, subtotal));
  const disc = Math.min(round2(Math.max(0, discount)), sub);

  const delivery = computeDelivery({ subtotal: sub, distanceKm, settings });
  const deliveryFee = delivery.ok ? delivery.fee : 0;

  const taxableValue = round2(sub + (settings.gstRegistered && settings.gstOnDelivery ? deliveryFee : 0));

  let gst = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (settings.gstRegistered) {
    gst = round2(taxableValue * settings.gstRate);
    if (settings.gstSplit === 'igst') {
      igst = gst;
    } else {
      cgst = round2(gst / 2);
      sgst = round2(gst - cgst); // keeps cgst+sgst === gst with no drift
    }
  }

  const total = round2(Math.max(0, sub + gst + deliveryFee - disc));

  return {
    subtotal: sub,
    discount: disc,
    taxableValue,
    gst,
    cgst,
    sgst,
    igst,
    gstRate: settings.gstRate,
    gstRegistered: settings.gstRegistered,
    gstSplit: settings.gstSplit,
    deliveryMode: delivery.mode,
    deliveryFee,
    deliveryDistanceKm: delivery.distanceKm,
    deliveryRatePerKm: delivery.rate,
    deliveryOk: delivery.ok,
    deliveryReason: delivery.reason,
    total
  };
}

// ------------------------------------------------------------------
// Status metadata — the single source of truth for the customer Orders view
// and the staff dashboard. Uses the exact database status strings.
// ------------------------------------------------------------------
export const ORDER_STATUSES = ['Order Received', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];

export const STATUS_META = {
  'Order Received': { label: 'Order Received', tone: 'amber', step: 0, terminal: false },
  Preparing: { label: 'Preparing', tone: 'violet', step: 1, terminal: false },
  'Out for Delivery': { label: 'Out for Delivery', tone: 'gold', step: 2, terminal: false },
  Delivered: { label: 'Delivered', tone: 'green', step: 3, terminal: true },
  Cancelled: { label: 'Cancelled', tone: 'red', step: -1, terminal: true, cancelled: true }
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', tone: 'neutral', step: -1, terminal: false };
}

export const isCancelled = (status) => status === 'Cancelled';

export function money(n) {
  const v = Number(n || 0);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}
