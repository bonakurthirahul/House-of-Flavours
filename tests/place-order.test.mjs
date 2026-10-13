// House of Flavours — checkout / place_order regression checks.
//
// Default run (no flags): static checks only. Never touches the database.
//
// Live run (after you have applied migration 004 to the target Supabase
// project):
//   PowerShell:  $env:HOF_ALLOW_DB_TESTS=1; npm test
// It creates clearly-labelled HOF-TEST-<timestamp> orders. There is no
// order-delete RLS policy, so remove them from the SQL editor afterwards
// if you do not want them in your history.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'supabase', 'migrations', '004_fix_place_order_order_items_fk.sql');

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

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

// ------------------------------------------------------------------
// Static checks against migration 004.
// ------------------------------------------------------------------
function staticChecks() {
  console.log('\nStatic checks (migration 004):');
  check('migration file exists', fs.existsSync(migrationPath));
  if (!fs.existsSync(migrationPath)) return;

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const orderIdx = sql.indexOf('insert into public.orders');
  const itemsIdx = sql.indexOf('insert into public.order_items');

  check('parent insert into public.orders exists', orderIdx !== -1);
  check('child insert into public.order_items exists', itemsIdx !== -1);
  check('parent order is inserted BEFORE order_items', orderIdx !== -1 && itemsIdx !== -1 && orderIdx < itemsIdx);
  check('id is captured from the INSERT response', /returning\s+order_id\s+into\s+v_order_id/i.test(sql));
  check('order_items use the captured v_order_id', /values\s*\(\s*v_order_id\s*,/i.test(sql));
  check('signature preserved (8-arg place_order)', /place_order\(\s*p_order_id\s+text,\s*p_customer_name\s+text,\s*p_phone\s+text,\s*p_address\s+text,/i.test(sql));
  check('stays SECURITY DEFINER with fixed search_path', /security definer/i.test(sql) && /set search_path = public/i.test(sql));
  check('does not disable RLS', !/disable row level security/i.test(sql));
  check('does not drop/alter tables', !/\b(drop|alter)\s+table\b/i.test(sql));
}

// ------------------------------------------------------------------
// Optional live checks against the configured Supabase project.
// ------------------------------------------------------------------
async function liveChecks() {
  console.log('\nLive DB checks (HOF_ALLOW_DB_TESTS=1):');
  const env = { ...parseEnv(path.join(root, '.env')) };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log('  SKIP  Supabase env not configured in .env');
    return;
  }

  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch {
    console.log('  SKIP  @supabase/supabase-js not installed');
    return;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: menu, error: menuErr } = await supabase
    .from('menu_items')
    .select('id, name, price')
    .eq('is_available', true)
    .limit(2);
  if (menuErr || !menu || menu.length < 1) {
    check('menu_items readable', false, menuErr?.message || 'no available items');
    return;
  }

  const stamp = Date.now();
  const successId = `HOF-TEST-${stamp}-OK`;
  const items = [
    ...menu.map((m) => ({ menu_id: m.id, quantity: 2 })),
    { name: 'HOF Test Upsell', price: 10, quantity: 1 }
  ];

  // 1) Successful multi-item order.
  const ok = await supabase.rpc('place_order', {
    p_order_id: successId,
    p_customer_name: 'HOF Automated Test',
    p_phone: '0000000000',
    p_address: 'Automated test order — safe to ignore',
    p_instructions: 'automated test',
    p_payment_method: 'Cash on Delivery (COD)',
    p_discount: 0,
    p_items: items
  });
  check('multi-item order succeeds (no 23503 FK error)', !ok.error, ok.error?.message);
  check('returned order_id matches the submitted order_id', ok.data?.order_id === successId, `got ${ok.data?.order_id}`);

  // 2) The parent row really persisted: re-submitting the same id must now
  //    fail with a unique-violation (23505), never a FK error (23503).
  const dup = await supabase.rpc('place_order', {
    p_order_id: successId,
    p_customer_name: 'HOF Automated Test',
    p_phone: '0000000000',
    p_address: 'Automated test order — safe to ignore',
    p_items: items
  });
  check('parent order exists in orders (duplicate id => 23505, not 23503)', dup.error?.code === '23505', dup.error ? `${dup.error.code}: ${dup.error.message}` : 'unexpectedly succeeded');

  // 3) Failed item insertion must not leave a partial order behind.
  const failId = `HOF-TEST-${stamp}-BAD`;
  const bad = await supabase.rpc('place_order', {
    p_order_id: failId,
    p_customer_name: 'HOF Automated Test',
    p_phone: '0000000000',
    p_address: 'Automated test order — safe to ignore',
    p_items: [{ menu_id: 'HOF_DOES_NOT_EXIST_XYZ', quantity: 1 }]
  });
  check('invalid menu item is rejected', !!bad.error, 'expected an error');

  const reuse = await supabase.rpc('place_order', {
    p_order_id: failId,
    p_customer_name: 'HOF Automated Test',
    p_phone: '0000000000',
    p_address: 'Automated test order — safe to ignore',
    p_items: items
  });
  check('failed item insertion rolled back (same id reusable)', !reuse.error, reuse.error?.message);
}

staticChecks();
if (process.env.HOF_ALLOW_DB_TESTS === '1') {
  await liveChecks();
} else {
  console.log('\nLive DB checks skipped (set HOF_ALLOW_DB_TESTS=1 to run them after applying migration 004).');
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
