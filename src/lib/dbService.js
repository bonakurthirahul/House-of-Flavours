import { supabase } from './supabase.js';

// Database access through the Supabase client.
// Every read/write is subject to Row Level Security on the server; the browser
// only ever holds the publishable key. Staff-only operations are additionally
// gated server-side by is_staff()/current_user_role() checks inside
// security-definer functions and staff-only RLS policies.

const TABLE_MISSING_CODE = 'PGRST205';

const friendlyError = (err) => {
  const code = err?.code || '';
  if (code === TABLE_MISSING_CODE) {
    return 'Database schema is not set up yet. Ask an admin to run the Supabase migrations (supabase/migrations).';
  }
  if (code === '42501') return 'Permission denied by database security policies.';
  if (/network|fetch|Failed to fetch/i.test(err?.message || '')) {
    return 'Network error reaching the database.';
  }
  if (code === 'P0001') return err?.message || 'Database operation rejected.';
  return err?.message || 'Database operation failed.';
};

// Map DB row -> the dish shape used across the app.
export const rowToDish = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description || '',
  price: Number(r.price),
  image: r.image || '/placeholder.svg',
  category: r.category,
  isVeg: Boolean(r.is_veg),
  isAvailable: r.is_available !== false,
  sort_order: r.sort_order || 0
});

const dishToRow = (d) => ({
  id: d.id,
  name: (d.name || '').trim(),
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

// ------------------------------------------------------------------
// Menu item CRUD (staff). RLS (003) restricts these to authorized staff.
// ------------------------------------------------------------------
export async function upsertMenuItem(dish) {
  const { error } = await supabase.from('menu_items').upsert(dishToRow(dish));
  if (error) throw new Error(friendlyError(error));
}

export async function setAvailability(id, isAvailable) {
  const { error } = await supabase
    .from('menu_items')
    .update({ is_available: Boolean(isAvailable) })
    .eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// Soft delete: deactivate so historical order_items keep valid references.
export async function deactivateMenuItem(id) {
  return setAvailability(id, false);
}

// Hard delete (manager-only policy). Fails safely if the item is referenced.
export async function deleteMenuItem(id) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// ------------------------------------------------------------------
// Categories
// ------------------------------------------------------------------
export async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

export async function createCategory({ name, description = '', sort_order = 0 }) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), description, sort_order: Number(sort_order) || 0 })
    .select()
    .single();
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function updateCategory(id, patch) {
  const { data, error } = await supabase.from('categories').update(patch).eq('id', id).select().single();
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// Count menu items per category name (used to guard category deletion).
export async function countMenuItemsByCategory() {
  const { data, error } = await supabase.from('menu_items').select('category');
  if (error) throw new Error(friendlyError(error));
  const counts = {};
  (data || []).forEach((r) => {
    counts[r.category] = (counts[r.category] || 0) + 1;
  });
  return counts;
}

// ------------------------------------------------------------------
// Orders
// ------------------------------------------------------------------
// Staff-only in practice: RLS returns everything for staff, and only the
// caller's own rows for an authenticated customer.
export async function loadOrdersFromDb({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

export async function adminOrderStats() {
  const { data, error } = await supabase.rpc('admin_order_stats');
  if (error) throw new Error(friendlyError(error));
  return data || null;
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

// Staff-only permanent deletion of a Delivered/Cancelled order. The database
// re-checks authorization and the live status inside a transaction; the UI
// button is only a convenience, never the security boundary.
export async function deleteOrder(orderId) {
  const { error } = await supabase.rpc('delete_order', { p_order_id: orderId });
  if (error) throw new Error(friendlyError(error));
}

// ------------------------------------------------------------------
// Contact inbox (migration 006). Public submit is via a validated RPC; only
// staff can read/manage the stored messages (enforced by RLS server-side).
// ------------------------------------------------------------------
export async function submitContactMessage({ name, phone, email, message }) {
  const { data, error } = await supabase.rpc('submit_contact_message', {
    p_name: name,
    p_phone: phone || '',
    p_email: email || '',
    p_message: message
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}

export async function loadContactMessages({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

export async function setContactMessageRead(id, isRead) {
  const { error } = await supabase
    .from('contact_messages')
    .update({ is_read: Boolean(isRead), read_at: isRead ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

export async function deleteContactMessage(id) {
  const { error } = await supabase.from('contact_messages').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error));
}

// ------------------------------------------------------------------
// Customer reviews (migration 007). Public reads return APPROVED reviews only
// (RLS also enforces this server-side). Submitting goes exclusively through
// the validated submit_review() RPC, which enforces authentication, ownership,
// a Delivered order, rating/comment bounds and one review per order.
// ------------------------------------------------------------------
const REVIEW_PUBLIC_STATUS = 'approved';

export async function loadApprovedReviews({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, title, comment, reviewer_label, created_at')
    .eq('moderation_status', REVIEW_PUBLIC_STATUS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

// Order ids the current customer has already reviewed (RLS limits this to
// their own rows), used to hide already-reviewed orders from the form.
export async function loadReviewedOrderIds(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('order_id')
    .eq('user_id', userId);
  if (error) throw new Error(friendlyError(error));
  return (data || []).map((r) => r.order_id).filter(Boolean);
}

// The customer's completed (Delivered) orders — the only ones they may review.
export async function loadReviewableOrders(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('order_id, items_summary, created_at')
    .eq('user_id', userId)
    .eq('status', 'Delivered')
    .order('created_at', { ascending: false });
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

export async function submitReview({ orderId, rating, title, comment }) {
  const { data, error } = await supabase.rpc('submit_review', {
    p_order_id: orderId,
    p_rating: Number(rating),
    p_title: title || '',
    p_comment: comment
  });
  if (error) throw new Error(friendlyError(error));
  return data;
}

// ------------------------------------------------------------------
// Settings (staff read via RLS; public keys via get_public_settings()).
// ------------------------------------------------------------------
export async function getPublicSettings() {
  try {
    const { data, error } = await supabase.rpc('get_public_settings');
    if (error) throw error;
    return data || null;
  } catch {
    return null;
  }
}

export async function adminLoadSettings() {
  const { data, error } = await supabase.from('app_settings').select('*');
  if (error) throw new Error(friendlyError(error));
  return data || [];
}

export async function adminSetSetting(key, value) {
  const { error } = await supabase.rpc('admin_set_setting', { p_key: key, p_value: String(value) });
  if (error) throw new Error(friendlyError(error));
}

// ------------------------------------------------------------------
// Realtime: subscribe to order changes (RLS still applies to the payload, so a
// customer only receives their own rows; staff receive all). Returns an
// unsubscribe function. Callers MUST clean it up.
// ------------------------------------------------------------------
export function subscribeToOrders(onChange, { channelName = 'staff-orders' } = {}) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
      try {
        onChange(payload);
      } catch {
        /* ignore handler errors so the channel stays healthy */
      }
    })
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}
