import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadMenuFromDb, upsertMenuItem, setAvailability, deleteMenuItem } from '../../lib/dbService.js';
import { Button, EmptyState, ErrorState, Modal, Skeleton, StatusBadge, ConfirmDialog, useToast } from '../ui.jsx';
import { Plus, RefreshCw } from '../../components/icons.jsx';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const emptyDraft = (categories) => ({
  id: `hof_custom_${Date.now().toString().slice(-6)}`,
  name: '',
  description: '',
  price: '',
  image: '',
  category: categories[0]?.name || 'Starters',
  isVeg: true,
  isAvailable: true
});

export function MenuManager({ isManager }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { categories: cats, items: dishes } = await loadMenuFromDb();
      setCategories(cats || []);
      setItems(dishes || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((d) => d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q));
  }, [items, query]);

  const save = async () => {
    if (!draft) return;
    const name = (draft.name || '').trim();
    const price = Number(draft.price);
    if (!name) { toast.error('Menu item name is required.'); return; }
    if (!draft.category) { toast.error('Category is required.'); return; }
    if (!Number.isFinite(price) || price < 0) { toast.error('Enter a valid non-negative price.'); return; }

    setSaving(true);
    try {
      await upsertMenuItem({ ...draft, name, price, description: (draft.description || '').trim() });
      toast.success(`“${name}” saved.`);
      setDraft(null);
      await reload();
    } catch (err) {
      toast.error(err.message, 'Could not save item');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (dish) => {
    setTogglingId(dish.id);
    try {
      await setAvailability(dish.id, !dish.isAvailable);
      setItems((list) => list.map((d) => (d.id === dish.id ? { ...d, isAvailable: !d.isAvailable } : d)));
      toast.success(`“${dish.name}” marked ${dish.isAvailable ? 'sold out' : 'available'}.`);
    } catch (err) {
      toast.error(err.message, 'Could not update availability');
    } finally {
      setTogglingId(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteMenuItem(confirmDelete.id);
      toast.success(`“${confirmDelete.name}” deleted.`);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      toast.error(err.message, 'Delete failed');
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Menu</h2>
          <p className="text-xs text-cream-500 mt-0.5">Prices and items are stored in the database and used for live pricing.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Reload</Button>
          <Button onClick={() => setDraft(emptyDraft(categories))}><Plus className="w-3.5 h-3.5" /> Add Item</Button>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search menu items…"
        className="w-full sm:max-w-sm px-4 py-2.5 text-sm bg-night-850 border border-gold-500/15 rounded-full outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50"
        aria-label="Search menu items"
      />

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState title="No menu items" hint="Add your first item to get started." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((dish) => (
            <div key={dish.id} className="glass rounded-2xl p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={dish.image}
                  alt=""
                  width="48"
                  height="48"
                  loading="lazy"
                  onError={(e) => { if (!e.currentTarget.src.includes('/placeholder.svg')) e.currentTarget.src = '/placeholder.svg'; }}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 bg-night-800"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-cream-100 truncate">{dish.name}</div>
                  <div className="flex items-center gap-2 text-[11px] text-cream-500 mt-0.5">
                    <span className={dish.isVeg ? 'text-emerald-400 font-bold' : 'text-burgundy-400 font-bold'}>{dish.isVeg ? 'VEG' : 'NON-VEG'}</span>
                    <span>· {dish.category}</span>
                    <span className="text-gold-300 font-bold">· {money(dish.price)}</span>
                  </div>
                  <div className="mt-1"><StatusBadge status={dish.isAvailable ? 'Delivered' : 'Cancelled'} /></div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <button
                  onClick={() => toggleAvailability(dish)}
                  disabled={togglingId === dish.id}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition disabled:opacity-60 ${dish.isAvailable ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-burgundy-600/25 text-burgundy-400 border border-burgundy-400/40'}`}
                >
                  {dish.isAvailable ? 'Available' : 'Sold out'}
                </button>
                <div className="flex gap-1.5">
                  <button onClick={() => setDraft({ ...dish, price: String(dish.price) })} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-night-800 border border-gold-500/20 text-cream-200 hover:border-gold-500/50">Edit</button>
                  {isManager && (
                    <button onClick={() => setConfirmDelete(dish)} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-burgundy-600/30 border border-burgundy-400/40 text-burgundy-400 hover:bg-burgundy-600/50">Delete</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        title={draft && items.some((d) => d.id === draft.id) ? 'Edit menu item' : 'Add menu item'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save item</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold text-cream-300 block mb-1">Name *</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-cream-300 block mb-1">Description</label>
              <textarea rows="2" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1">Price (₹) *</label>
                <input type="number" min="0" step="1" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1">Category *</label>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50">
                  {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-cream-300 block mb-1">Image URL</label>
              <input value={draft.image} onChange={(e) => setDraft({ ...draft, image: e.target.value })} placeholder="https://…" className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50" />
            </div>
            <div className="flex items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-cream-300 cursor-pointer">
                <input type="checkbox" checked={draft.isVeg} onChange={(e) => setDraft({ ...draft, isVeg: e.target.checked })} className="accent-emerald-500 w-4 h-4" /> Vegetarian
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-cream-300 cursor-pointer">
                <input type="checkbox" checked={draft.isAvailable} onChange={(e) => setDraft({ ...draft, isAvailable: e.target.checked })} className="accent-gold-500 w-4 h-4" /> Available
              </label>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete menu item?"
        message={confirmDelete ? `“${confirmDelete.name}” will be permanently removed. Past orders keep their recorded item names and prices.` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
