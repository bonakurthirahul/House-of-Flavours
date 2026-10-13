// House of Flavours — customer reviews & ratings checks.
// Static + source-hygiene only: never touches the database.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
// Migration 007 static checks
// ------------------------------------------------------------------
function migrationChecks() {
  console.log('\nMigration 007 (customer reviews):');
  const p = path.join(root, 'supabase', 'migrations', '007_customer_reviews.sql');
  check('007 exists', fs.existsSync(p));
  if (!fs.existsSync(p)) return;
  const m = read(path.join('supabase', 'migrations', '007_customer_reviews.sql'));

  check('creates public.reviews', /create table if not exists public\.reviews/i.test(m));
  check('rating is constrained between 1 and 5', /rating\s+int\s+not null check \(rating between 1 and 5\)/i.test(m));
  check('has optional title + required comment', /title\s+text not null default ''/i.test(m) && /comment\s+text not null/i.test(m));
  check('has moderation status', /moderation_status/i.test(m) && /('pending', 'approved', 'rejected')/.test(m));
  check('has a privacy-safe reviewer label', /reviewer_label/i.test(m));
  check('enables RLS', /alter table public\.reviews enable row level security/i.test(m));
  check('does not disable RLS', !/disable row level security/i.test(m));

  check('public read policy only exposes approved reviews',
    /create policy "reviews_select_approved"[\s\S]*?using \(moderation_status = 'approved'\)/i.test(m));
  check('own-read policy exists', /create policy "reviews_select_own"[\s\S]*?auth\.uid\(\) = user_id/i.test(m));
  check('staff read + moderate policies exist', /reviews_staff_read/i.test(m) && /reviews_staff_update/i.test(m));
  check('only managers may delete reviews', /reviews_manager_delete[\s\S]*?current_user_role\(\) = 'manager'/i.test(m));
  check('no direct insert policy (submission only via RPC)', !/for insert/i.test(m));

  check('submit_review is SECURITY DEFINER with fixed search_path',
    /function public\.submit_review[\s\S]*?security definer[\s\S]*?set search_path = public/i.test(m));
  check('submit_review requires authentication', /auth\.uid\(\)/.test(m) && /NOT_AUTHENTICATED/i.test(m));
  check('submit_review requires a Delivered order owned by the caller',
    /user_id = v_uid/i.test(m) && /v_status <> 'Delivered'/i.test(m));
  check('submit_review prevents duplicate reviews per order', /ALREADY_REVIEWED/i.test(m));
  check('submit_review derives the display name from profiles (not the client)',
    /from public\.profiles where id = v_uid/i.test(m));
  check('grants execute to authenticated only (not anon)',
    /grant execute on function public\.submit_review[^;]*to authenticated/i.test(m) &&
    !/grant execute on function public\.submit_review[^;]*to anon/i.test(m));
  check('duplicate prevention enforced by a unique index', /create unique index[^;]*reviews_user_order_uidx/i.test(m));
}

// ------------------------------------------------------------------
// Service layer
// ------------------------------------------------------------------
function serviceChecks() {
  console.log('\nReview service (dbService.js):');
  const svc = read(path.join('src', 'lib', 'dbService.js'));

  check('loadApprovedReviews filters by approved status',
    /export async function loadApprovedReviews/.test(svc) && /moderation_status/.test(svc) && /REVIEW_PUBLIC_STATUS = 'approved'/.test(svc));
  check('loadApprovedReviews sorts newest first',
    /\.order\('created_at',\s*\{\s*ascending:\s*false\s*\}\)/.test(svc));
  check('loadReviewableOrders filters Delivered orders for the user',
    /export async function loadReviewableOrders/.test(svc) && /\.eq\('status', 'Delivered'\)/.test(svc));
  check('loadReviewedOrderIds is scoped to the user', /export async function loadReviewedOrderIds/.test(svc));
  check('submitReview calls the submit_review RPC with p_order_id/p_rating/p_title/p_comment',
    /supabase\.rpc\(\s*['"]submit_review['"]\s*,\s*\{[\s\S]*?p_order_id[\s\S]*?p_rating[\s\S]*?p_title[\s\S]*?p_comment/.test(svc));
}

// ------------------------------------------------------------------
// UI wiring
// ------------------------------------------------------------------
function uiChecks() {
  console.log('\nReviews UI:');
  const r = read(path.join('src', 'components', 'Reviews.jsx'));

  check('heading is "What Our Customers Say"', /What Our Customers[\s\S]*?Say/.test(r));
  check('fetches real reviews via the service layer', /loadApprovedReviews/.test(r) && !/siteConfig\.reviews/.test(r));
  check('computes average + count from the data', /reduce\(/.test(r) && /count/.test(r));
  check('has Write a Review action', /Write a Review/.test(r));
  check('has a star-rating input (1-5)', /length: 5/.test(r) && /role="radiogroup"/.test(r));
  check('has a friendly empty state', /Be the first to share your experience/.test(r));
  check('has loading + error states', /aria-busy/.test(r) && /Try again/.test(r));
  check('has View All Reviews when warranted', /View All Reviews/.test(r));
  check('submits via submitReview service', /submitReview\(/.test(r));
  const submitMatch = r.match(/const handleSubmit\s*=\s*async[\s\S]*?\n  \};/);
  const catchPart = submitMatch ? (submitMatch[0].split('catch')[1] || '') : '';
  check('preserves input on failure (catch keeps form, shows error)',
    /setSubmitError\(err\.message/.test(catchPart) && !/setForm/.test(catchPart));
  check('guards against duplicate submissions', /disabled=\{submitting\}/.test(r));

  const app = read(path.join('src', 'App.jsx'));
  check('App passes currentUser to <Reviews />', /<Reviews[\s\S]*?currentUser=\{currentUser\}/.test(app));

  const cfg = read(path.join('src', 'config.js'));
  check('config.js no longer holds placeholder reviews', !/reviews:\s*\[/.test(cfg) && !/sample:\s*true/.test(cfg));
}

// ------------------------------------------------------------------
// Security hygiene: no privileged key in the browser bundle.
// ------------------------------------------------------------------
function securityChecks() {
  console.log('\nReview security hygiene:');
  const walk = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc);
      else if (/\.(jsx?|mjs)$/.test(entry.name)) acc.push(full);
    }
    return acc;
  };
  const offenders = [];
  for (const f of walk(path.join(root, 'src'))) {
    const text = fs.readFileSync(f, 'utf8');
    if (/service_role|SERVICE_ROLE|VITE_SUPABASE_SERVICE/i.test(text)) offenders.push(path.relative(root, f));
  }
  check('no service-role key referenced in src', offenders.length === 0, offenders.join('; '));
}

migrationChecks();
serviceChecks();
uiChecks();
securityChecks();

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
