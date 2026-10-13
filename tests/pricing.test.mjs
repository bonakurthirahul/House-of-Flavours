// House of Flavours — pricing, migration & source-hygiene checks.
// Static + pure-function only: never touches the database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PRICING_SETTINGS,
  DELIVERY_ORIGIN,
  normalizeSettings,
  computeDelivery,
  computeOrderTotals,
  statusMeta
} from '../src/lib/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ------------------------------------------------------------------
// Pricing module
// ------------------------------------------------------------------
function pricingChecks() {
  console.log('\nPricing module:');
  check('defaults do NOT collect GST (unregistered)', computeOrderTotals({ subtotal: 200 }).gst === 0);
  check('origin coordinates are the confirmed values',
    DELIVERY_ORIGIN.lat === 17.429889 && DELIVERY_ORIGIN.lng === 78.687861);
  check('default delivery rate is ₹50/km', DEFAULT_PRICING_SETTINGS.deliveryRatePerKm === 50);
  check('distance pricing is OFF by default (flat)', DEFAULT_PRICING_SETTINGS.deliveryMode === 'flat');

  const flatFree = computeOrderTotals({ subtotal: 499 });
  check('flat delivery free at/above threshold', flatFree.deliveryFee === 0);
  const flatPaid = computeOrderTotals({ subtotal: 200 });
  check('flat delivery charged below threshold', flatPaid.deliveryFee === DEFAULT_PRICING_SETTINGS.deliveryFlatFee);

  const unverified = computeDelivery({ subtotal: 200, distanceKm: null, settings: { ...DEFAULT_PRICING_SETTINGS, deliveryMode: 'distance' } });
  check('distance mode refuses to guess without a verified distance', unverified.ok === false && unverified.reason === 'DISTANCE_UNVERIFIED');

  const dist = computeOrderTotals({ subtotal: 200, distanceKm: 7.5, settings: { ...DEFAULT_PRICING_SETTINGS, deliveryMode: 'distance' } });
  check('distance fee = distance × rate (₹50/km)', eq(dist.deliveryFee, 375));

  const gst = computeOrderTotals({ subtotal: 1000, settings: { ...DEFAULT_PRICING_SETTINGS, gstRegistered: true, gstRate: 0.05 } });
  check('CGST+SGST equals total GST', eq(gst.cgst + gst.sgst, gst.gst));
  const igst = computeOrderTotals({ subtotal: 1000, settings: { ...DEFAULT_PRICING_SETTINGS, gstRegistered: true, gstRate: 0.05, gstSplit: 'igst' } });
  check('inter-state uses IGST only', igst.igst === igst.gst && igst.cgst === 0 && igst.sgst === 0);

  const norm = normalizeSettings({ gst_registered: 'true', gst_rate: '5', delivery_rate_per_km: '50', delivery_mode: 'flat' });
  check('normalizeSettings accepts integer percentage (5 -> 0.05)', eq(norm.gstRate, 0.05) && norm.gstRegistered === true);

  check('unknown status falls back safely', statusMeta('Nonsense').label === 'Nonsense');
  check('Cancelled is terminal/cancelled', statusMeta('Cancelled').cancelled === true);
}

// ------------------------------------------------------------------
// Migrations 005 & 006 static checks
// ------------------------------------------------------------------
function migrationChecks() {
  console.log('\nMigrations 005/006:');
  const p005 = path.join(root, 'supabase', 'migrations', '005_pricing_tax_delivery.sql');
  const p006 = path.join(root, 'supabase', 'migrations', '006_admin_orders_contact.sql');
  check('005 exists', fs.existsSync(p005));
  check('006 exists', fs.existsSync(p006));
  if (!fs.existsSync(p005) || !fs.existsSync(p006)) return;

  const m5 = fs.readFileSync(p005, 'utf8');
  const orderIdx = m5.indexOf('insert into public.orders');
  const itemsIdx = m5.indexOf('insert into public.order_items');
  check('005 keeps parent-before-child insert (FK fix preserved)', orderIdx !== -1 && itemsIdx !== -1 && orderIdx < itemsIdx);
  check('005 still uses RETURNING order_id into v_order_id', /returning\s+order_id\s+into\s+v_order_id/i.test(m5));
  check('005 defines the GST kill-switch setting', /gst_registered/i.test(m5));
  check('005 stores confirmed origin coordinates', /17\.429889/.test(m5) && /78\.687861/.test(m5));
  check('005 keeps SECURITY DEFINER + fixed search_path', /security definer/i.test(m5) && /set search_path = public/i.test(m5));
  check('005 does not disable RLS', !/disable row level security/i.test(m5));

  const m6 = fs.readFileSync(p006, 'utf8');
  check('006 delete_order re-checks Delivered/Cancelled', /delete_order/.test(m6) && /v_status not in \('Delivered', 'Cancelled'\)/.test(m6));
  check('006 adds a staff-only contact inbox', /contact_messages/.test(m6) && /is_staff\(\)/.test(m6));
  check('006 contact submit validates and is security definer', /submit_contact_message/.test(m6) && /security definer/i.test(m6));
  check('006 does not disable RLS', !/disable row level security/i.test(m6));
}

// ------------------------------------------------------------------
// Source hygiene: no WhatsApp ordering, no SheetDB order submission
// ------------------------------------------------------------------
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

function hygieneChecks() {
  console.log('\nSource hygiene:');
  const files = walk(path.join(root, 'src'));
  const offenders = [];
  const openers = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (/wa\.me|api\.whatsapp\.com/i.test(text)) offenders.push(`${path.relative(root, f)} (WhatsApp)`);
    if (/sheetdb\.io|SHEETDB_URL/i.test(text)) offenders.push(`${path.relative(root, f)} (SheetDB)`);
    // A checkout/order flow must never open an external window/tab (the historical
    // WhatsApp redirect used window.open('https://wa.me/...')).
    if (/window\.open\s*\(/.test(text)) openers.push(path.relative(root, f));
  }
  check('no WhatsApp/SheetDB endpoints remain in src', offenders.length === 0, offenders.join('; '));
  check('no window.open() redirects remain in src', openers.length === 0, openers.join('; '));
}

// ------------------------------------------------------------------
// Checkout-wiring regression: the Place Order handler MUST submit to
// Supabase via placeOrderToDb, and MUST NOT redirect to WhatsApp/SheetDB.
// This is the check that would have failed against the old WhatsApp build.
// ------------------------------------------------------------------
function checkoutHandlerChecks() {
  console.log('\nCheckout wiring:');
  const appPath = path.join(root, 'src', 'App.jsx');
  const svcPath = path.join(root, 'src', 'lib', 'dbService.js');
  const app = fs.readFileSync(appPath, 'utf8');
  const svc = fs.readFileSync(svcPath, 'utf8');

  check('App.jsx imports placeOrderToDb', /placeOrderToDb/.test(app) && /from '\.\/lib\/dbService\.js'/.test(app));
  check('App.jsx calls placeOrderToDb(...)', /placeOrderToDb\s*\(\s*\{/.test(app));

  const m = app.match(/const handleProceedOrder\s*=\s*async[\s\S]*?\n  \};/);
  check('handleProceedOrder handler is present', Boolean(m));
  if (m) {
    const body = m[0];
    check('handleProceedOrder calls placeOrderToDb', /placeOrderToDb\s*\(/.test(body));
    check('handleProceedOrder has NO WhatsApp/SheetDB/window.open redirect',
      !/wa\.me|api\.whatsapp\.com|sheetdb|window\.open/i.test(body),
      'handler still contains an external ordering redirect');
  }

  check('dbService.placeOrderToDb calls the place_order RPC', /place_order/.test(svc) && /supabase\.rpc\(\s*['"]place_order['"]/.test(svc));

  // The served entry point must be the React app, never the legacy backup file.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  check('index.html loads /src/main.jsx', /\/src\/main\.jsx/.test(html));
  check('index.html does not reference the legacy backup', !/index \(1\)\.html/.test(html));
}

// ------------------------------------------------------------------
// Staff order deletion: only Delivered/Cancelled may be deleted, the UI
// reuses the existing deleteOrder service + delete_order RPC, and the
// database (not the frontend) is the final authority.
// ------------------------------------------------------------------
function staffDeletionChecks() {
  console.log('\nStaff order deletion:');
  const overview = fs.readFileSync(path.join(root, 'src', 'admin', 'sections', 'Overview.jsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'src', 'admin', 'AdminDashboard.jsx'), 'utf8');
  const svc = fs.readFileSync(path.join(root, 'src', 'lib', 'dbService.js'), 'utf8');
  const m6 = fs.readFileSync(path.join(root, 'supabase', 'migrations', '006_admin_orders_contact.sql'), 'utf8');

  check('Overview restricts deletable set to Delivered/Cancelled',
    /DELETABLE_STATUSES\s*=\s*\[\s*'Delivered'\s*,\s*'Cancelled'\s*\]/.test(overview));
  check('Overview filters the closed list by DELETABLE_STATUSES',
    /const closed[\s\S]*?DELETABLE_STATUSES\.includes/.test(overview));
  check('Overview has a Delete control gated by canDelete',
    /canDelete\s*&&/.test(overview) && /Delete/.test(overview));
  check('Overview has a confirmation dialog before deleting', /ConfirmDialog/.test(overview) && /onConfirm=\{handleDelete\}/.test(overview));

  check('AdminDashboard passes onDelete to Overview', /<Overview[\s\S]*?onDelete=\{deleteOrderRow\}/.test(dashboard));
  check('AdminDashboard imports the deleteOrder service', /import\s*\{[^}]*deleteOrder[^}]*\}\s*from\s*'\.\.\/lib\/dbService\.js'/.test(dashboard));
  check('deleteOrder service calls the delete_order RPC (no duplicate API)',
    /export async function deleteOrder/.test(svc) && /supabase\.rpc\(\s*['"]delete_order['"]\s*,\s*\{\s*p_order_id:\s*orderId/.test(svc));

  // Server is the authority: authorization + status re-checked in the RPC.
  check('delete_order RPC verifies staff authorization', /if not public\.is_staff\(\)/.test(m6));
  check('delete_order RPC re-checks status inside the transaction',
    /v_status not in \('Delivered', 'Cancelled'\)/.test(m6) && /for update/i.test(m6));
}

pricingChecks();
migrationChecks();
hygieneChecks();
checkoutHandlerChecks();
staffDeletionChecks();

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
