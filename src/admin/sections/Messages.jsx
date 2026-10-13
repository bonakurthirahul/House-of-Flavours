import { useCallback, useEffect, useState } from 'react';
import { loadContactMessages, setContactMessageRead, deleteContactMessage } from '../../lib/dbService.js';
import { Badge, Button, EmptyState, ErrorState, Skeleton, ConfirmDialog, useToast } from '../ui.jsx';
import { Mail, Phone, RefreshCw } from '../../components/icons.jsx';

const fmt = (ts) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '';
  }
};

export function Messages({ isManager }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const rows = await loadContactMessages({ limit: 200 });
      setMessages(rows);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load messages.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleRead = async (msg) => {
    setPendingId(msg.id);
    try {
      await setContactMessageRead(msg.id, !msg.is_read);
      setMessages((list) => list.map((m) => (m.id === msg.id ? { ...m, is_read: !msg.is_read } : m)));
    } catch (err) {
      toast.error(err.message || 'Could not update message.', 'Update failed');
    } finally {
      setPendingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!confirmTarget) return;
    setDeleting(true);
    try {
      await deleteContactMessage(confirmTarget.id);
      setMessages((list) => list.filter((m) => m.id !== confirmTarget.id));
      toast.success('Message deleted.');
      setConfirmTarget(null);
    } catch (err) {
      toast.error(err.message || 'Could not delete message.', 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const visible = onlyUnread ? messages.filter((m) => !m.is_read) : messages;
  const unreadCount = messages.filter((m) => !m.is_read).length;

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => load()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Messages</h2>
          <p className="text-xs text-cream-500 mt-0.5">
            Enquiries submitted from the website contact form.{unreadCount > 0 ? ` ${unreadCount} unread.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setOnlyUnread((v) => !v)}>
            {onlyUnread ? 'Show all' : 'Unread only'}
          </Button>
          <Button variant="secondary" onClick={() => load()}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={onlyUnread ? 'No unread messages' : 'No messages yet'} hint="New contact-form enquiries will appear here." />
      ) : (
        <div className="space-y-3">
          {visible.map((m) => (
            <div key={m.id} className={`glass rounded-2xl p-4 sm:p-5 border ${m.is_read ? 'border-gold-500/10' : 'border-gold-500/40'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-cream-100 text-sm truncate">{m.name}</span>
                    {!m.is_read && <Badge tone="amber">New</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-cream-500">
                    {m.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {m.phone}</span>}
                    {m.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {m.email}</span>}
                    <span>{fmt(m.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" loading={pendingId === m.id} onClick={() => toggleRead(m)}>
                    {m.is_read ? 'Mark unread' : 'Mark read'}
                  </Button>
                  {isManager && (
                    <Button variant="danger" onClick={() => setConfirmTarget(m)}>Delete</Button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-cream-300 whitespace-pre-wrap break-words">{m.message}</p>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        title="Delete message"
        message={confirmTarget ? `Permanently delete the message from ${confirmTarget.name}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
