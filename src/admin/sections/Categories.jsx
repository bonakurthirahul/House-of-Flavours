import { useCallback, useEffect, useState } from 'react';
import { loadCategories, countMenuItemsByCategory, createCategory, updateCategory, deleteCategory } from '../../lib/dbService.js';
import { Button, EmptyState, ErrorState, Modal, Skeleton, ConfirmDialog, useToast } from '../ui.jsx';
import { Plus, RefreshCw } from '../../components/icons.jsx';

export function Categories({ isManager }) {
  const toast = useToast();
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cats, itemCounts] = await Promise.all([loadCategories(), countMenuItemsByCategory()]);
      setCategories(cats);
      setCounts(itemCounts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = async () => {
    if (!draft) return;
    const name = (draft.name || '').trim();
    if (!name) { toast.error('Category name is required.'); return; }
    setSaving(true);
    try {
      if (draft.id) {
        await updateCategory(draft.id, { name, description: draft.description || '', sort_order: Number(draft.sort_order) || 0 });
        toast.success(`Category renamed to “${name}”.`);
      } else {
        await createCategory({ name, description: draft.description || '', sort_order: Number(draft.sort_order) || 0 });
        toast.success(`Category “${name}” created.`);
      }
      setDraft(null);
      await reload();
    } catch (err) {
      toast.error(err.message, 'Could not save category');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteCategory(confirmDelete.id);
      toast.success(`Category “${confirmDelete.name}” deleted.`);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      toast.error(err.message, 'Delete failed');
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Categories</h2>
          <p className="text-xs text-cream-500 mt-0.5">Menu items reference a category. Renaming cascades to items.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Reload</Button>
          <Button onClick={() => setDraft({ name: '', description: '', sort_order: categories.length })}><Plus className="w-3.5 h-3.5" /> Add</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : categories.length === 0 ? (
        <EmptyState title="No categories" hint="Create a category before adding menu items." />
      ) : (
        <div className="space-y-2.5">
          {categories.map((c) => {
            const count = counts[c.name] || 0;
            return (
              <div key={c.id} className="glass rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-cream-100">{c.name}</div>
                  <div className="text-[11px] text-cream-500 mt-0.5">
                    {c.description || 'No description'} · {count} item{count === 1 ? '' : 's'} · order {c.sort_order}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setDraft({ ...c, sort_order: String(c.sort_order) })} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-night-800 border border-gold-500/20 text-cream-200 hover:border-gold-500/50">Edit</button>
                  {isManager && (
                    <button
                      onClick={() => (count > 0 ? toast.error('Move or delete its items first.', 'Category in use') : setConfirmDelete(c))}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-burgundy-600/30 border border-burgundy-400/40 text-burgundy-400 hover:bg-burgundy-600/50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!draft}
        title={draft?.id ? 'Edit category' : 'Add category'}
        onClose={() => setDraft(null)}
        footer={<><Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></>}
      >
        {draft && (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold text-cream-300 block mb-1">Name *</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-cream-300 block mb-1">Description</label>
              <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-cream-300 block mb-1">Sort order</label>
              <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} className="w-full px-3 py-2.5 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50" />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete category?"
        message={confirmDelete ? `“${confirmDelete.name}” will be permanently removed.` : ''}
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
