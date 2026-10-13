import { useState } from 'react';
import { siteConfig } from '../config.js';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { Lock, Eye, EyeOff, ShieldCheck, Mail, ArrowRight, Sparkle } from '../components/icons.jsx';
import { loginStaff } from '../lib/authService.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { Button, Spinner } from './ui.jsx';

export function AdminLogin({ onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isSupabaseConfigured) {
      setError('Authentication is unavailable: Supabase is not configured.');
      return;
    }
    if (!email.trim() || !password) {
      setError('Please enter your staff email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await loginStaff(email, password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onAuthenticated?.();
    } catch (err) {
      setError(err?.message || 'Network error while signing in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-night-950 text-cream-100 grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-r border-gold-500/10">
        <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${siteConfig.heroImage})` }} />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-night-950/80 via-night-950/90 to-night-950" />
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 w-96 h-96 rounded-full bg-gold-500/15 blur-[120px]" />
        <div aria-hidden="true" className="absolute -top-24 right-0 w-80 h-80 rounded-full bg-burgundy-600/25 blur-[120px]" />

        <a href="/" onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="relative flex items-center gap-3 w-fit">
          <BrandLogo className="w-12 h-12" />
          <div>
            <div className="font-display text-xl font-bold text-cream-100">House of <span className="text-gradient-gold">Flavours</span></div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-cream-500">Restaurant Admin</div>
          </div>
        </a>

        <div className="relative">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-gold-300 border border-gold-500/30 bg-gold-500/5 px-4 py-2 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" /> Staff Portal
          </span>
          <h1 className="mt-6 font-display text-4xl xl:text-5xl font-bold leading-tight text-cream-100">
            Manage the kitchen,
            <br /> one service at a time.
          </h1>
          <p className="mt-4 text-sm text-cream-300/85 max-w-sm">
            Live orders, menu pricing and availability — secured with verified staff roles and row-level policies.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-[11px] text-cream-500">
          <Sparkle className="w-3.5 h-3.5 text-gold-500/70" />
          Authorised personnel only. All actions are database-audited.
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <a href="/" onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="lg:hidden flex items-center gap-2.5 mb-8 w-fit">
            <BrandLogo className="w-10 h-10" />
            <span className="font-display text-lg font-bold text-cream-100">House of <span className="text-gradient-gold">Flavours</span></span>
          </a>

          <div className="w-12 h-12 rounded-2xl bg-burgundy-600/30 border border-burgundy-400/40 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-gold-300" />
          </div>
          <h2 className="mt-5 font-display text-3xl font-bold text-cream-100">Admin Sign In</h2>
          <p className="mt-1.5 text-sm text-cream-400">Enter your staff account credentials.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
            <div>
              <label htmlFor="admin-email" className="text-[11px] font-bold text-cream-300 block mb-1.5">Staff email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/20 transition"
                  placeholder="you@hof.in"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="text-[11px] font-bold text-cream-300 block mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 focus:ring-2 focus:ring-gold-500/20 transition"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg text-cream-400 hover:text-gold-300 transition"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-burgundy-600/20 border border-burgundy-400/40 text-burgundy-400 text-[11px] font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full font-bold text-sm transition flex items-center justify-center gap-2 bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? <><Spinner className="w-4 h-4" /> Verifying…</> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="mt-6 text-[11px] text-cream-500 leading-relaxed">
            Staff accounts are provisioned by the restaurant owner. There is no public staff registration.
          </p>

          <a
            href="/"
            onClick={(e) => { e.preventDefault(); window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); }}
            className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-gold-300 hover:text-gold-200 transition"
          >
            ← Back to website
          </a>
        </div>
      </div>
    </div>
  );
}
