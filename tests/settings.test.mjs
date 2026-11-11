// House of Flavours — Admin Settings implementation checks.
// Static + pure-function only: never touches the database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSiteInfo } from '../src/lib/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// ------------------------------------------------------------------
// Migration 008: settings seeds, public allowlist, storage bucket.
// ------------------------------------------------------------------
function migrationChecks() {
  console.log('\nMigration 008 (settings + site-assets bucket):');
  const p = path.join(root, 'supabase', 'migrations', '008_payments_notifications_settings.sql');
  check('008 exists', fs.existsSync(p));
  if (!fs.existsSync(p)) return;
  const m = read(path.join('supabase', 'migrations', '008_payments_notifications_settings.sql'));

  check('does not disable RLS', !/disable row level security/i.test(m));
  check('does not drop settings tables', !/drop\s+table\s+public\.app_settings/i.test(m));
  check('never references a service-role key', !/service_role/i.test(m));

  check('seeds restaurant info keys', ['restaurant_name', 'restaurant_phone', 'restaurant_email', 'restaurant_address', 'restaurant_hours', 'restaurant_logo_url'].every((k) => m.includes(`'${k}'`)));
  check('seeds UPI + payment methods', /'upi_id'/.test(m) && /'payment_methods'/.test(m));
  check('seeds GST + delivery pricing keys', ['gst_registered', 'gst_rate', 'delivery_mode', 'delivery_flat_fee', 'delivery_free_threshold', 'delivery_rate_per_km'].every((k) => m.includes(`'${k}'`)));

  check('get_public_settings exposes restaurant info (public-safe allowlist)',
    /create or replace function public\.get_public_settings/.test(m) && /'restaurant_name'/.test(m) && /'restaurant_logo_url'/.test(m));
  check('get_public_settings stays SECURITY DEFINER with fixed search_path',
    /function public\.get_public_settings[\s\S]*?security definer[\s\S]*?set search_path = public/i.test(m));

  check('creates the public site-assets bucket', /insert into storage\.buckets[\s\S]*?values\s*\(\s*'site-assets'\s*,\s*'site-assets'\s*,\s*true\s*\)/i.test(m));
  check('site-assets public read policy exists', /create policy "site_assets_public_read"[\s\S]*?bucket_id = 'site-assets'/i.test(m));
  check('site-assets insert policy is staff-only',
    /create policy "site_assets_staff_insert"[\s\S]*?bucket_id = 'site-assets' and public\.is_staff\(\)/i.test(m));
  check('site-assets update policy is staff-only',
    /create policy "site_assets_staff_update"[\s\S]*?bucket_id = 'site-assets' and public\.is_staff\(\)/i.test(m));
}

// ------------------------------------------------------------------
// Service layer: reads, writes and logo upload go through safe paths.
// ------------------------------------------------------------------
function serviceChecks() {
  console.log('\nSettings service (dbService.js):');
  const svc = read(path.join('src', 'lib', 'dbService.js'));

  check('adminLoadSettings reads the app_settings table', /export async function adminLoadSettings[\s\S]*?from\('app_settings'\)\.select/.test(svc));
  check('adminSetSetting uses the staff-only admin_set_setting RPC',
    /export async function adminSetSetting[\s\S]*?supabase\.rpc\(\s*['"]admin_set_setting['"]\s*,\s*\{\s*p_key:\s*key,\s*p_value:\s*String\(value\)/.test(svc));
  check('no direct app_settings writes bypass the RPC', !/from\('app_settings'\)\.(insert|update|upsert|delete)/.test(svc));

  check('uploadSiteLogo validates image type', /image\\\/\(png\|jpe\?g\|webp\|svg\\\+xml\)/i.test(svc));
  check('uploadSiteLogo enforces the 2 MB limit', /2 \* 1024 \* 1024/.test(svc));
  check('uploadSiteLogo uploads to the site-assets bucket', /from\('site-assets'\)[\s\S]*?\.upload\(/.test(svc));
  check('uploadSiteLogo returns the public URL', /from\('site-assets'\)\.getPublicUrl\(path\)/.test(svc));
  check('missing bucket produces an actionable migration hint', /bucket not found[\s\S]*?008_payments_notifications_settings\.sql/i.test(svc));
}

// ------------------------------------------------------------------
// Settings UI wiring.
// ------------------------------------------------------------------
function uiChecks() {
  console.log('\nSettings UI (Settings.jsx):');
  const s = read(path.join('src', 'admin', 'sections', 'Settings.jsx'));

  check('loads settings via the service layer', /adminLoadSettings/.test(s));
  check('saves settings via the service layer', /adminSetSetting/.test(s));
  check('does not import the raw Supabase client', !/from '\.\.\/\.\.\/lib\/supabase\.js'/.test(s));

  check('has restaurant information fields',
    ['restaurant_name', 'restaurant_phone', 'restaurant_email', 'restaurant_address', 'restaurant_hours', 'upi_id', 'payment_methods'].every((k) => s.includes(`'${k}'`)));
  check('has pricing + delivery fields',
    ['gst_registered', 'gst_rate', 'gst_split', 'gst_on_delivery', 'gstin', 'delivery_mode', 'delivery_flat_fee', 'delivery_free_threshold', 'delivery_rate_per_km', 'delivery_origin_label'].every((k) => s.includes(`'${k}'`)));
  check('keeps the operations store toggle', /store_open/.test(s) && /toggleStore/.test(s));

  check('logo upload uses the uploadSiteLogo service', /uploadSiteLogo\(/.test(s));
  check('logo file input accepts images', /accept="image\/png,image\/jpeg,image\/webp,image\/svg\+xml"/.test(s));
  check('validates the GST rate bounds', /rate <= 0 \|\| rate > 100/.test(s));
  check('validates the email format', /EMAIL_RE/.test(s));
  check('validates the GSTIN format', /GSTIN_RE/.test(s));
  check('requires at least one payment method', /Enable at least one payment method/.test(s));

  check('has loading skeletons', /<Skeleton/.test(s));
  check('has an error state with retry', /<ErrorState/.test(s) && /onRetry=\{reload\}/.test(s));
  check('has Save and Reset controls', /Save changes/.test(s) && /resetSection/.test(s));
  check('tracks unsaved changes', /dirtyInfo/.test(s) && /dirtyPricing/.test(s));
  check('warns when the storefront migration is not applied', /008_payments_notifications_settings\.sql/.test(s));
}

// ------------------------------------------------------------------
// normalizeSiteInfo: safe fallbacks + canonical payment methods.
// ------------------------------------------------------------------
function normalizationChecks() {
  console.log('\nnormalizeSiteInfo fallbacks:');
  const fallback = { brandName: 'Fallback Kitchen', phone: '+91 90000 00000', email: 'a@b.com', address: 'Somewhere', hours: '9-5', logoUrl: '/logo.png' };
  const empty = normalizeSiteInfo({}, fallback);
  check('falls back to config values when settings are missing',
    empty.brandName === fallback.brandName && empty.phone === fallback.phone && empty.email === fallback.email && empty.logoUrl === fallback.logoUrl);
  check('defaults payment methods to UPI + COD', empty.paymentMethods.join(',') === 'UPI,COD');

  const canon = normalizeSiteInfo({ payment_methods: 'cod, UPI,bitcoin', restaurant_name: '  Real Name  ' }, fallback);
  check('canonicalises payment methods and drops unknown ones', canon.paymentMethods.slice().sort().join(',') === 'COD,UPI');
  check('trims saved restaurant name', canon.brandName === 'Real Name');
}

migrationChecks();
serviceChecks();
uiChecks();
normalizationChecks();

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
