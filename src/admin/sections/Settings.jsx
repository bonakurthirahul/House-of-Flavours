import { useCallback, useEffect, useState } from 'react';
import { siteConfig } from '../../config.js';
import { adminLoadSettings, adminSetSetting } from '../../lib/dbService.js';
import { Button, ErrorState, Skeleton, useToast } from '../ui.jsx';
import { RefreshCw } from '../../components/icons.jsx';

export function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSettings(await adminLoadSettings());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const storeOpen = (settings.find((s) => s.key === 'store_open')?.value ?? 'true') === 'true';

  const toggleStore = async () => {
    const next = !storeOpen;
    setSavingKey('store_open');
    try {
      await adminSetSetting('store_open', next ? 'true' : 'false');
      setSettings((list) => {
        const others = list.filter((s) => s.key !== 'store_open');
        return [...others, { key: 'store_open', value: next ? 'true' : 'false', updated_at: new Date().toISOString() }];
      });
      toast.success(`Store marked ${next ? 'open' : 'closed'}.`);
    } catch (err) {
      toast.error(err.message, 'Could not save setting');
    } finally {
      setSavingKey(null);
    }
  };

  const info = [
    { label: 'Restaurant name', value: siteConfig.brandName },
    { label: 'Phone', value: siteConfig.phone },
    { label: 'Email', value: siteConfig.email },
    { label: 'Address', value: siteConfig.address },
    { label: 'Hours', value: siteConfig.hours }
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-cream-100">Settings</h2>
          <p className="text-xs text-cream-500 mt-0.5">Operational toggles persist in the database and are shared across devices.</p>
        </div>
        <Button variant="secondary" onClick={reload}><RefreshCw className="w-3.5 h-3.5" /> Refresh</Button>
      </div>

      {loading ? (
        <Skeleton className="h-24" />
      ) : error ? (
        <ErrorState message={`${error} — if this is a first setup, apply supabase/migrations/003_admin_dashboard.sql.`} onRetry={reload} />
      ) : (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-bold text-cream-100">Store status</h3>
          <div className="mt-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-cream-300">Currently accepting orders: <span className={storeOpen ? 'text-emerald-400 font-bold' : 'text-burgundy-400 font-bold'}>{storeOpen ? 'OPEN' : 'CLOSED'}</span></p>
              <p className="text-[11px] text-cream-500 mt-0.5">Shown on the customer site as a service banner.</p>
            </div>
            <Button onClick={toggleStore} loading={savingKey === 'store_open'} variant={storeOpen ? 'danger' : 'primary'}>
              {storeOpen ? 'Close store' : 'Open store'}
            </Button>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <h3 className="text-sm font-bold text-cream-100">Restaurant details</h3>
        <p className="text-[11px] text-cream-500 mt-1">Read-only. Edit these in <code className="text-gold-300">src/config.js</code> and redeploy.</p>
        <dl className="mt-4 grid sm:grid-cols-2 gap-4">
          {info.map((row) => (
            <div key={row.label}>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-cream-500">{row.label}</dt>
              <dd className="text-sm text-cream-100 mt-0.5 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
