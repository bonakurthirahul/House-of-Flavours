import { useCallback, useEffect, useRef, useState } from 'react';
import { siteConfig } from '../../config.js';
import { UPI_ID } from '../../constants.js';
import { adminLoadSettings, adminSetSetting, getPublicSettings, uploadSiteLogo } from '../../lib/dbService.js';
import { Badge, Button, ErrorState, Skeleton, useToast } from '../ui.jsx';
import { BrandLogo } from '../../components/BrandLogo.jsx';
import { Camera, Check, RefreshCw } from '../../components/icons.jsx';

const DEFAULTS = {
  restaurant_name: siteConfig.brandName,
  restaurant_phone: siteConfig.phone,
  restaurant_email: siteConfig.email,
  restaurant_address: siteConfig.address,
  restaurant_hours: siteConfig.hours,
  restaurant_logo_url: siteConfig.logoUrl || '',
  upi_id: UPI_ID,
  payment_methods: 'UPI,COD',
  gst_registered: 'false',
  gst_rate: '5',
  gst_split: 'cgst_sgst',
  gst_on_delivery: 'false',
  gstin: '',
  delivery_mode: 'flat',
  delivery_flat_fee: '35',
  delivery_free_threshold: '499',
  delivery_rate_per_km: '50',
  delivery_origin_label: 'Ghanapuram'
};

const INFO_KEYS = [
  'restaurant_name',
  'restaurant_phone',
  'restaurant_email',
  'restaurant_address',
  'restaurant_hours',
  'restaurant_logo_url',
  'upi_id',
  'payment_methods'
];

const PRICING_KEYS = [
  'gst_registered',
  'gst_rate',
  'gst_split',
  'gst_on_delivery',
  'gstin',
  'delivery_mode',
  'delivery_flat_fee',
  'delivery_free_threshold',
  'delivery_rate_per_km',
  'delivery_origin_label'
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/;
const PHONE_RE = /^[+\d][\d\s()-]{5,19}$/;
const TRUE_RE = /^(true|1|yes|on)$/i;
const LOGO_TYPES = /^image\/(png|jpe?g|webp|svg\+xml)$/i;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const inputCls = 'w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-sm text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50';

const parseMethods = (raw) => String(raw || '')
  .split(',')
  .map((m) => m.trim().toUpperCase())
  .filter((m) => m === 'UPI' || m === 'COD');

const normalizeForSave = (key, value) => {
  let v = String(value ?? '').trim();
  if (key === 'gstin') v = v.toUpperCase();
  return v;
};

const toNum = (value) => {
  const s = String(value ?? '').trim();
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

function Field({ id, label, hint, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-bold text-cream-300 block mb-1">{label}</label>
      {children}
      {error
        ? <p className="text-[11px] text-burgundy-400 mt-1">{error}</p>
        : hint ? <p className="text-[11px] text-cream-500 mt-1">{hint}</p> : null}
    </div>
  );
}

export function Settings() {
  const toast = useToast();
  const [saved, setSaved] = useState(DEFAULTS);
  const [draft, setDraft] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [savingSection, setSavingSection] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [storefrontReady, setStorefrontReady] = useState(true);
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, publicSettings] = await Promise.all([adminLoadSettings(), getPublicSettings()]);
      const map = {};
      (rows || []).forEach((row) => {
        if (row && row.key) map[row.key] = row.value ?? '';
      });
      const merged = { ...DEFAULTS, ...map };
      setSaved(merged);
      setDraft(merged);
      setErrors({});
      setLogoFile(null);
      setStorefrontReady(Boolean(publicSettings) && Object.prototype.hasOwnProperty.call(publicSettings, 'restaurant_name'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(draft.restaurant_logo_url || '');
      return undefined;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile, draft.restaurant_logo_url]);

  const storeOpen = TRUE_RE.test(draft.store_open ?? 'true');
  const gstRegistered = TRUE_RE.test(draft.gst_registered ?? 'false');
  const gstOnDelivery = TRUE_RE.test(draft.gst_on_delivery ?? 'false');
  const gstSplit = draft.gst_split === 'igst' ? 'igst' : 'cgst_sgst';
  const deliveryMode = draft.delivery_mode === 'distance' ? 'distance' : 'flat';
  const enabledMethods = parseMethods(draft.payment_methods);

  const dirtyInfo = Boolean(logoFile)
    || INFO_KEYS.some((k) => normalizeForSave(k, draft[k]) !== (saved[k] ?? ''));
  const dirtyPricing = PRICING_KEYS.some((k) => normalizeForSave(k, draft[k]) !== (saved[k] ?? ''));

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const toggleMethod = (method) => {
    const next = enabledMethods.includes(method)
      ? enabledMethods.filter((m) => m !== method)
      : [...enabledMethods, method];
    const ordered = ['UPI', 'COD'].filter((m) => next.includes(m));
    setField('payment_methods', ordered.join(','));
  };

  const toggleGstRegistered = (checked) => {
    setField('gst_registered', checked ? 'true' : 'false');
    setErrors((e) => {
      const next = { ...e };
      delete next.gstin;
      delete next.gst_rate;
      return next;
    });
  };

  const changeDeliveryMode = (mode) => {
    setField('delivery_mode', mode);
    setErrors((e) => {
      const next = { ...e };
      delete next.delivery_origin_label;
      return next;
    });
  };

  const validateInfo = () => {
    const e = {};
    const name = String(draft.restaurant_name ?? '').trim();
    if (!name) e.restaurant_name = 'Restaurant name is required.';
    else if (name.length > 80) e.restaurant_name = 'Keep the name under 80 characters.';

    const phone = String(draft.restaurant_phone ?? '').trim();
    if (!phone) e.restaurant_phone = 'Phone is required.';
    else if (!PHONE_RE.test(phone)) e.restaurant_phone = 'Enter a valid phone number.';

    const email = String(draft.restaurant_email ?? '').trim();
    if (email && !EMAIL_RE.test(email)) e.restaurant_email = 'Enter a valid email address.';

    const address = String(draft.restaurant_address ?? '').trim();
    if (address.length > 200) e.restaurant_address = 'Keep the address under 200 characters.';

    const hours = String(draft.restaurant_hours ?? '').trim();
    if (hours.length > 120) e.restaurant_hours = 'Keep hours under 120 characters.';

    const upi = String(draft.upi_id ?? '').trim();
    if (upi && !UPI_RE.test(upi)) e.upi_id = 'Enter a valid UPI id, e.g. 9948099296@fam.';

    if (!parseMethods(draft.payment_methods).length) e.payment_methods = 'Enable at least one payment method.';
    return e;
  };

  const validatePricing = () => {
    const e = {};
    if (gstRegistered) {
      if (String(draft.gst_rate ?? '').trim() === '') {
        e.gst_rate = 'GST rate is required when GST is enabled.';
      } else {
        const rate = toNum(draft.gst_rate);
        if (Number.isNaN(rate) || rate <= 0 || rate > 100) e.gst_rate = 'Enter a rate between 0 and 100 (%).';
      }
      const gstin = String(draft.gstin ?? '').trim().toUpperCase();
      if (gstin && !GSTIN_RE.test(gstin)) e.gstin = 'GSTIN must be 15 characters, e.g. 22AAAAA0000A1Z5.';
    }

    if (deliveryMode === 'flat') {
      const fee = toNum(draft.delivery_flat_fee);
      if (Number.isNaN(fee) || fee < 0) e.delivery_flat_fee = 'Enter a non-negative amount.';
      const free = toNum(draft.delivery_free_threshold);
      if (Number.isNaN(free) || free < 0) e.delivery_free_threshold = 'Enter a non-negative amount.';
    } else {
      const rate = toNum(draft.delivery_rate_per_km);
      if (Number.isNaN(rate) || rate < 0) e.delivery_rate_per_km = 'Enter a non-negative amount.';
      if (!String(draft.delivery_origin_label ?? '').trim()) e.delivery_origin_label = 'Delivery origin is required in distance mode.';
    }
    return e;
  };

  const toggleStore = async () => {
    const next = !storeOpen;
    const value = next ? 'true' : 'false';
    setSavingSection('store');
    try {
      await adminSetSetting('store_open', value);
      setSaved((s) => ({ ...s, store_open: value }));
      setDraft((d) => ({ ...d, store_open: value }));
      toast.success(`Store marked ${next ? 'open' : 'closed'}.`);
    } catch (err) {
      toast.error(err.message, 'Could not save setting');
    } finally {
      setSavingSection(null);
    }
  };

  const saveSection = async (sectionId, keys, validate) => {
    const found = validate();
    if (Object.keys(found).length) {
      setErrors(found);
      toast.error('Fix the highlighted fields before saving.', 'Validation failed');
      return;
    }

    setSavingSection(sectionId);
    try {
      let current = draft;
      if (sectionId === 'info' && logoFile) {
        const url = await uploadSiteLogo(logoFile);
        current = { ...draft, restaurant_logo_url: url };
        setDraft(current);
        setLogoFile(null);
      }

      const changes = {};
      keys.forEach((k) => {
        const value = normalizeForSave(k, current[k]);
        if (value !== (saved[k] ?? '')) changes[k] = value;
      });
      const changedKeys = Object.keys(changes);
      if (!changedKeys.length) {
        toast.info('No changes to save.');
        return;
      }

      let savedCount = 0;
      let failure = null;
      for (const key of changedKeys) {
        try {
          await adminSetSetting(key, changes[key]);
          savedCount += 1;
        } catch (err) {
          failure = err;
          break;
        }
      }

      const persisted = {};
      changedKeys.slice(0, savedCount).forEach((k) => { persisted[k] = changes[k]; });
      setSaved((s) => ({ ...s, ...persisted }));
      setDraft((d) => ({ ...d, ...persisted }));

      if (failure) {
        toast.error(`${failure.message} — saved ${savedCount} of ${changedKeys.length} values.`, 'Could not save settings');
      } else {
        setErrors({});
        toast.success(`${savedCount} setting${savedCount === 1 ? '' : 's'} saved.`);
      }
    } catch (err) {
      toast.error(err.message, 'Could not save settings');
    } finally {
      setSavingSection(null);
    }
  };

  const resetSection = (sectionId, keys) => {
    setDraft((d) => {
      const next = { ...d };
      keys.forEach((k) => { next[k] = saved[k] ?? DEFAULTS[k] ?? ''; });
      return next;
    });
    setErrors({});
    if (sectionId === 'info') setLogoFile(null);
  };

  const onLogoPick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.test(file.type || '')) {
      toast.error('Logo must be a PNG, JPG, WEBP or SVG image.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be smaller than 2 MB.');
      return;
    }
    setLogoFile(file);
    setErrors((e) => {
      const next = { ...e };
      delete next.restaurant_logo_url;
      return next;
    });
  };

  const removeLogo = () => {
    setLogoFile(null);
    setField('restaurant_logo_url', '');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Settings</h2>
          <p className="text-xs text-cream-500 mt-0.5">Restaurant info, pricing and operations persist in the database and apply across devices.</p>
        </div>
        <Button variant="secondary" onClick={reload} disabled={loading}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-72" />
          <Skeleton className="h-64" />
        </div>
      ) : error ? (
        <ErrorState message={`${error} — if this is a first setup, apply supabase/migrations/003_admin_dashboard.sql.`} onRetry={reload} />
      ) : (
        <>
          {!storefrontReady && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 leading-relaxed">
              <p className="font-bold">One-time setup needed</p>
              <p className="mt-1">
                Saving works now, but the storefront will only display these values — and logo uploads need the storage bucket — once
                <code className="text-amber-300"> supabase/migrations/008_payments_notifications_settings.sql </code>
                is applied to the database.
              </p>
            </div>
          )}

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-bold text-cream-100">Operations</h3>
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-cream-300">Currently accepting orders: <span className={storeOpen ? 'text-emerald-400 font-bold' : 'text-burgundy-400 font-bold'}>{storeOpen ? 'OPEN' : 'CLOSED'}</span></p>
                <p className="text-[11px] text-cream-500 mt-0.5">Shown on the customer site as a service banner.</p>
              </div>
              <Button onClick={toggleStore} loading={savingSection === 'store'} variant={storeOpen ? 'danger' : 'primary'}>
                {storeOpen ? 'Close store' : 'Open store'}
              </Button>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-cream-100">Restaurant information</h3>
                  {dirtyInfo && <Badge tone="amber">Unsaved</Badge>}
                </div>
                <p className="text-[11px] text-cream-500 mt-0.5">Shown to customers on the storefront, invoices and order confirmations.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => resetSection('info', INFO_KEYS)} disabled={!dirtyInfo || savingSection !== null}>Reset</Button>
                <Button onClick={() => saveSection('info', INFO_KEYS, validateInfo)} loading={savingSection === 'info'} disabled={!dirtyInfo}>Save changes</Button>
              </div>
            </div>

            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <Field id="set-restaurant-name" label="Restaurant name *" error={errors.restaurant_name}>
                <input id="set-restaurant-name" value={draft.restaurant_name} onChange={(e) => setField('restaurant_name', e.target.value)} className={inputCls} />
              </Field>
              <Field id="set-phone" label="Phone *" error={errors.restaurant_phone}>
                <input id="set-phone" type="tel" value={draft.restaurant_phone} onChange={(e) => setField('restaurant_phone', e.target.value)} className={inputCls} />
              </Field>
              <Field id="set-email" label="Email" error={errors.restaurant_email} hint="Used for contact and invoices.">
                <input id="set-email" type="email" value={draft.restaurant_email} onChange={(e) => setField('restaurant_email', e.target.value)} className={inputCls} />
              </Field>
              <Field id="set-address" label="Address" error={errors.restaurant_address}>
                <input id="set-address" value={draft.restaurant_address} onChange={(e) => setField('restaurant_address', e.target.value)} className={inputCls} />
              </Field>
              <Field id="set-hours" label="Opening hours" error={errors.restaurant_hours}>
                <input id="set-hours" value={draft.restaurant_hours} onChange={(e) => setField('restaurant_hours', e.target.value)} className={inputCls} placeholder="Mon - Sun, 11:00 AM - 11:00 PM" />
              </Field>
              <Field id="set-upi" label="UPI ID" error={errors.upi_id} hint="Shown for UPI payments. Leave blank to hide the QR code.">
                <input id="set-upi" value={draft.upi_id} onChange={(e) => setField('upi_id', e.target.value)} className={inputCls} placeholder="name@bank" />
              </Field>
            </div>

            <div className="mt-4">
              <span className="text-[11px] font-bold text-cream-300 block mb-1.5">Payment methods</span>
              <div className="flex flex-wrap gap-2">
                {['UPI', 'COD'].map((method) => {
                  const active = enabledMethods.includes(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => toggleMethod(method)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold border transition ${active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-night-850 text-cream-500 border-night-600 hover:border-gold-500/40'}`}
                    >
                      {active && <Check className="w-3 h-3" />}
                      {method === 'UPI' ? 'UPI' : 'Cash on Delivery'}
                    </button>
                  );
                })}
              </div>
              {errors.payment_methods
                ? <p className="text-[11px] text-burgundy-400 mt-1.5">{errors.payment_methods}</p>
                : <p className="text-[11px] text-cream-500 mt-1.5">Customers can only pay with an enabled method.</p>}
            </div>

            <div className="mt-5 pt-4 border-t border-gold-500/10">
              <span className="text-[11px] font-bold text-cream-300 block mb-2">Restaurant logo</span>
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 rounded-2xl border border-gold-500/20 bg-night-850 flex items-center justify-center overflow-hidden shrink-0">
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    : <BrandLogo className="w-12 h-12" />}
                </div>
                <div className="min-w-0 flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={onLogoPick}
                    className="hidden"
                    aria-label="Choose logo file"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={savingSection !== null}>
                      <Camera className="w-3.5 h-3.5" /> {draft.restaurant_logo_url || logoFile ? 'Replace logo' : 'Upload logo'}
                    </Button>
                    {(logoFile || draft.restaurant_logo_url) && (
                      <Button variant="ghost" onClick={removeLogo} disabled={savingSection !== null}>Remove</Button>
                    )}
                  </div>
                  <p className="text-[11px] text-cream-500 mt-2">
                    {logoFile
                      ? <span className="text-gold-300">{logoFile.name} — saved when you save this section.</span>
                      : 'PNG, JPG, WEBP or SVG up to 2 MB. The built-in emblem is used until a logo is saved.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-cream-100">Pricing & delivery</h3>
                  {dirtyPricing && <Badge tone="amber">Unsaved</Badge>}
                </div>
                <p className="text-[11px] text-cream-500 mt-0.5">Tax and delivery rules are enforced by the database when orders are placed.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => resetSection('pricing', PRICING_KEYS)} disabled={!dirtyPricing || savingSection !== null}>Reset</Button>
                <Button onClick={() => saveSection('pricing', PRICING_KEYS, validatePricing)} loading={savingSection === 'pricing'} disabled={!dirtyPricing}>Save changes</Button>
              </div>
            </div>

            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-2.5 text-xs font-bold text-cream-200 cursor-pointer sm:col-span-2">
                <input type="checkbox" checked={gstRegistered} onChange={(e) => toggleGstRegistered(e.target.checked)} className="accent-gold-500 w-4 h-4" />
                GST registered — charge GST on orders
              </label>

              {gstRegistered && (
                <>
                  <Field id="set-gst-rate" label="GST rate (%)" error={errors.gst_rate} hint="e.g. 5 for 5%.">
                    <input id="set-gst-rate" type="number" min="0" max="100" step="0.01" value={draft.gst_rate} onChange={(e) => setField('gst_rate', e.target.value)} className={inputCls} />
                  </Field>
                  <Field id="set-gst-split" label="Tax split" hint="Intra-state (CGST+SGST) or inter-state (IGST).">
                    <select id="set-gst-split" value={gstSplit} onChange={(e) => setField('gst_split', e.target.value)} className={inputCls}>
                      <option value="cgst_sgst">CGST + SGST (intra-state)</option>
                      <option value="igst">IGST (inter-state)</option>
                    </select>
                  </Field>
                  <Field id="set-gstin" label="GSTIN" error={errors.gstin} hint="Optional — printed on invoices when set.">
                    <input id="set-gstin" value={draft.gstin} onChange={(e) => setField('gstin', e.target.value.toUpperCase())} className={inputCls} placeholder="22AAAAA0000A1Z5" />
                  </Field>
                  <label className="flex items-center gap-2.5 text-xs font-bold text-cream-200 cursor-pointer self-start pt-6">
                    <input type="checkbox" checked={gstOnDelivery} onChange={(e) => setField('gst_on_delivery', e.target.checked ? 'true' : 'false')} className="accent-gold-500 w-4 h-4" />
                    Include the delivery fee in taxable value
                  </label>
                </>
              )}

              <Field id="set-delivery-mode" label="Delivery fee mode" hint={deliveryMode === 'distance' ? 'Requires at least one active delivery zone, or orders are rejected.' : 'Flat fee with an optional free-delivery threshold.'}>
                <select id="set-delivery-mode" value={deliveryMode} onChange={(e) => changeDeliveryMode(e.target.value)} className={inputCls}>
                  <option value="flat">Flat fee</option>
                  <option value="distance">Distance-based (₹ per km)</option>
                </select>
              </Field>

              {deliveryMode === 'flat' ? (
                <>
                  <Field id="set-flat-fee" label="Flat delivery fee (₹)" error={errors.delivery_flat_fee}>
                    <input id="set-flat-fee" type="number" min="0" step="0.01" value={draft.delivery_flat_fee} onChange={(e) => setField('delivery_flat_fee', e.target.value)} className={inputCls} />
                  </Field>
                  <Field id="set-free-threshold" label="Free delivery above (₹)" error={errors.delivery_free_threshold} hint="Orders at or above this subtotal get free delivery.">
                    <input id="set-free-threshold" type="number" min="0" step="0.01" value={draft.delivery_free_threshold} onChange={(e) => setField('delivery_free_threshold', e.target.value)} className={inputCls} />
                  </Field>
                </>
              ) : (
                <>
                  <Field id="set-rate-per-km" label="Delivery rate (₹ / km)" error={errors.delivery_rate_per_km}>
                    <input id="set-rate-per-km" type="number" min="0" step="0.01" value={draft.delivery_rate_per_km} onChange={(e) => setField('delivery_rate_per_km', e.target.value)} className={inputCls} />
                  </Field>
                  <Field id="set-origin" label="Delivery origin" error={errors.delivery_origin_label} hint="Where deliveries are dispatched from.">
                    <input id="set-origin" value={draft.delivery_origin_label} onChange={(e) => setField('delivery_origin_label', e.target.value)} className={inputCls} />
                  </Field>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
