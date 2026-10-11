import { supabase } from './supabase.js';

// Database access through the Supabase client.
// Every read/write is subject to Row Level Security on the server; the browser
// only ever holds the publishable key. Staff-only operations are additionally
// gated server-side by the is_staff() checks inside security-definer functions.

const TABLE_MISSING_CODE = 'PGRST205';

const friendlyError = (err) => {
  const code = err?.code || '';
  if (code === TABLE_MISSING_CODE) {
    return 'Database schema is not set up yet. Ask an admin to run the Supabase migration (supabase/migrations/001_initial_schema.sql).';
  }
  if (code === '42501') return 'Permission denied by database security policies.';
  if (/network|fetch|Failed to fetch/i.test(err?.message || '')) {
    return 'Network error reaching the database.';
  }
  return err?.message || 'Database operation failed.';
};

// Map DB row -> the dish shape used across the app.
const rowToDish = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description || '',
  price: Number(r.price),
  image: r.image || '/placeholder.svg',
  category: r.category,
  isVeg: Boolean(r.is_veg),
  isAvailable: r.is_available !== false
});

const dishToRow = (d) => ({
  id: d.id,
  name: d.name,
  description: d.description || '',
  price: Number(d.price || 0),
  image: d.image || '',
  category: d.category,
  is_veg: Boolean(d.isVeg),
  is_available: d.isAvailable !== false,
  sort_order: d.sort_order || 0
});

export async function isSchemaReady() {
  const { error } = await supabase.from('categories').select('name').limit(1);
  return !error || (error.code !== TABLE_MISSING_CODE && !/PGRST205/.test(error.message));
}

export async function loadMenuFromDb() {
  const [{ data: cats, error: ce }, { data: items, error: ie }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('menu_items').select('*').order('sort_order', { ascending: true })
  ]);
  if (ce || ie) throw new Error(friendlyError(ce || ie));
  return { categories: cats || [], items: (items || []).map(rowToDish) };
}

export async function syncCatalogToDb(categories, items) {
  const pCategories = categories.map((c, i) => ({
    name: c.name,
    description: c.description || '',
    sort_order: c.sort_order ?? i
  }));
  const pItems = items.map(dishToRow);
  const { error } = await supabase.rpc('sync_catalog', { p_categories: pCategories, p_items: pItems });
  if (error) throw new Error(friendlyError(error));
}

export async function upsertMenuItem(dish) {
  const { error } = await supabase.from('menu_items').upsert(dishToRow(dish)).eq('id', dish.id);
  if (error) throw new Error(friendlyError(error));
}

export async function setAvailability(id, isAvailable) {
  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: Boolean(isAvailable) })
    .eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// Staff-only: full order list with line items.
export async function loadOrdersFromDb() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

// Customer / guest order placement. Totals are recomputed server-side from
// trusted menu prices inside the security-definer place_order() function.
export async function placeOrderToDb({ orderId, customerName, phone, address, instructions, paymentMethod, discount, items }) {
  const pItems = items.map((it) => ({
    menu_id: it.menuId || it.id || null,
    name: it.name || null,
    price: Number(it.price) || 0,
    quantity: it.quantity
  }));
  const { data, error } = await supabase.rpc('place_order', {
    p_order_id: orderId,
    p_customer_name: customerName,
    p_phone: phone,
    p_address: address,
    p_instructions: instructions || '',
    p_payment_method: paymentMethod,
    p_discount: Number(discount) || 0,
    p_items: pItems
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function updateOrderStatus(orderId, status) {
  const { data, error } = await supabase.rpc('set_order_status', {
    p_order_id: orderId,
    p_status: status
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}