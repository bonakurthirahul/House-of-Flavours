import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { updatePassword, logout } from '../lib/authService.js';
import { navigate } from '../lib/router.js';
import { BrandLogo } from './BrandLogo.jsx';
import { Lock, Eye, EyeOff, Check, ArrowRight } from './icons.jsx';

// Rendered at /reset-password. The Supabase recovery link redirects here with a
// recovery token; detectSessionInUrl (see lib/supabase.js) creates a temporary
// session. We confirm that session before allowing a password change.
export function PasswordResetScreen() {
  const [status, setStatus] = useState(isSupabaseConfigured ? 'checking' : 'unconfigured');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;

    const settle = (hasSession) => {
      if (!active) return;
      setStatus(hasSession ? 'ready' : 'invalid');
    };

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session) settle(true);
      } catch {
        /* falls through to the listener / timeout below */
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) settle(true);
    });

    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      settle(Boolean(data?.session));
    }, 2500);

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (data?.subscription) data.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await updatePassword(password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      await logout();
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full pl-11 pr-12 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition';

  return (
    <div className="min-h-screen bg-night-950 text-cream-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6"><BrandLogo className="w-14 h-14" /></div>
        <div className="glass rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold text-cream-100">Set a new password</h1>

          {status === 'unconfigured' && (
            <p className="mt-4 text-sm text-burgundy-400">Authentication is unavailable: Supabase is not configured.</p>
          )}

          {status === 'checking' && (
            <p className="mt-4 text-sm text-cream-400">Verifying your reset link…</p>
          )}

          {status === 'invalid' && (
            <>
              <p className="mt-4 text-sm text-burgundy-400">
                This password reset link is invalid or has expired. Please request a new one from the sign-in screen.
              </p>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="mt-6 w-full py-3 rounded-full font-bold text-sm bg-night-800 border border-gold-500/25 text-cream-200 hover:border-gold-500/50 transition"
              >
                Back to sign in
              </button>
            </>
          )}

          {status === 'ready' && !done && (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-sm">
              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1.5">New password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="••••••••" required />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-cream-400 hover:text-gold-300 transition" aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Confirm password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} placeholder="••••••••" required />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-burgundy-600/20 border border-burgundy-400/40 text-burgundy-400 text-[11px] font-semibold">{error}</div>
              )}

              <button type="submit" disabled={saving} className="w-full py-3.5 rounded-full font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 hover:brightness-110">
                {saving ? 'Saving…' : 'Update password'} {!saving && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {done && (
            <div className="mt-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Check className="w-5 h-5 text-emerald-300" />
              </div>
              <p className="mt-4 text-sm text-cream-200">Your password has been updated. You can now sign in with your new password.</p>
              <button onClick={() => navigate('/', { replace: true })} className="mt-6 w-full py-3 rounded-full font-bold text-sm bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 hover:brightness-110 transition">
                Go to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PasswordResetScreen;
