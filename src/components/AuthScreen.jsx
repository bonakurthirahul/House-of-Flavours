import { useState } from 'react';
import { siteConfig } from '../config.js';
import { requestPasswordReset } from '../lib/authService.js';
import { BrandLogo } from './BrandLogo.jsx';
import { UserIcon, Lock, Eye, EyeOff, ShieldCheck, Check, ArrowRight, MessageCircle, Sparkle, Mail } from './icons.jsx';

export function AuthScreen({
  authAction,
  setAuthAction,
  inputUser,
  setInputUser,
  inputPass,
  setInputPass,
  inputName,
  setInputName,
  inputPhone,
  setInputPhone,
  authErrorMsg,
  isAuthenticating,
  rememberMe,
  setRememberMe,
  onClose,
  onSubmit,
  onStaffPortal
}) {
  const [showPass, setShowPass] = useState(false);
  const isRegister = authAction === 'register';

  // Forgot-password (Supabase email reset) sub-flow.
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState('idle'); // idle | sending | sent | error
  const [forgotMsg, setForgotMsg] = useState('');

  const title = forgotOpen ? 'Reset Password' : isRegister ? 'Create Your Account' : 'Welcome Back';
  const subtitle = forgotOpen
    ? 'We will email you a secure link to set a new password.'
    : isRegister
      ? 'Join House of Flavours for faster checkout.'
      : 'Sign in to continue your flavour journey.';

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotMsg('');
    if (!forgotEmail.trim()) {
      setForgotStatus('error');
      setForgotMsg('Enter the email address registered to your account.');
      return;
    }
    setForgotStatus('sending');
    const res = await requestPasswordReset(forgotEmail);
    if (!res.ok) {
      setForgotStatus('error');
      setForgotMsg(res.error);
      return;
    }
    // Neutral success: never confirm whether an account exists.
    setForgotStatus('sent');
    setForgotMsg('If that address is registered, a password reset email is on its way. Check your inbox and spam folder.');
  };

  const closeForgot = () => {
    setForgotOpen(false);
    setForgotStatus('idle');
    setForgotMsg('');
    setForgotEmail('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center bg-night-950/85 backdrop-blur-xl p-0 sm:p-4">
      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 bg-night-900 border border-gold-500/15 sm:rounded-[2rem] overflow-hidden shadow-[0_50px_140px_-50px_rgba(0,0,0,1)] max-h-screen sm:max-h-[92vh]">

        {/* Left: brand panel */}
        <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden bg-night-950">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center opacity-25"
            style={{ backgroundImage: `url(${siteConfig.heroImage})` }}
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-night-950/70 via-night-950/85 to-night-950" />
          <div aria-hidden="true" className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full bg-gold-500/15 blur-[100px]" />
          <div aria-hidden="true" className="absolute -top-24 right-0 w-72 h-72 rounded-full bg-burgundy-600/25 blur-[100px]" />

          <div className="relative">
            <div className="flex items-center gap-3">
              <BrandLogo className="w-12 h-12" />
              <div>
                <div className="font-display text-xl font-bold text-cream-100">House of <span className="text-gradient-gold">Flavours</span></div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cream-500">Dum Biryani &amp; Kebabs</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <h2 className="font-display text-4xl font-bold leading-tight text-cream-100">
              {title}
            </h2>
            <p className="mt-3 text-sm text-cream-300/85 max-w-xs">
              {siteConfig.tagline}
            </p>

            <ul className="mt-8 space-y-3.5">
              {['Track every order in real time', 'Faster, one-tap checkout', 'Exclusive coupons & offers'].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-cream-200">
                  <span className="w-6 h-6 rounded-full bg-gold-500/15 border border-gold-500/30 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-gold-400" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center gap-2 text-[11px] text-cream-500">
            <Sparkle className="w-3.5 h-3.5 text-gold-500/70" />
            Premium flavours, since day one.
          </div>
        </div>

        {/* Right: form */}
        <div className="relative flex flex-col max-h-screen sm:max-h-[92vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full border border-gold-500/20 text-cream-300 hover:text-cream-100 hover:border-gold-500/50 transition z-10"
            aria-label="Close"
          >
            ✕
          </button>

          <div className="p-6 sm:p-10 flex-1 flex flex-col justify-center">
            {/* Small-screen brand */}
            <div className="lg:hidden flex items-center gap-2.5 mb-6">
              <BrandLogo className="w-10 h-10" />
              <span className="font-display text-lg font-bold text-cream-100">House of <span className="text-gradient-gold">Flavours</span></span>
            </div>

            <h3 className="font-display text-2xl sm:text-3xl font-bold text-cream-100">{title}</h3>
            <p className="mt-1.5 text-xs sm:text-sm text-cream-400">{subtitle}</p>

            {/* Sub tabs */}
            {!forgotOpen && (
              <div className="mt-6 flex gap-6 text-sm border-b border-gold-500/10">
                <button
                  type="button"
                  onClick={() => setAuthAction('login')}
                  className={`pb-2.5 font-bold border-b-2 -mb-px transition ${!isRegister ? 'border-gold-500 text-gold-300' : 'border-transparent text-cream-500 hover:text-cream-300'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthAction('register')}
                  className={`pb-2.5 font-bold border-b-2 -mb-px transition ${isRegister ? 'border-gold-500 text-gold-300' : 'border-transparent text-cream-500 hover:text-cream-300'}`}
                >
                  Create Account
                </button>
              </div>
            )}

            {forgotOpen ? (
              <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4 text-sm">
                <div>
                  <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Registered email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                {forgotMsg && (
                  <div className={`p-3 rounded-xl border text-[11px] font-semibold ${forgotStatus === 'error' ? 'bg-burgundy-600/20 border-burgundy-400/40 text-burgundy-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
                    {forgotMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={forgotStatus === 'sending'}
                  className="w-full py-3.5 rounded-full font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 hover:brightness-110"
                >
                  {forgotStatus === 'sending' ? 'Sending…' : 'Send reset link'}
                  {forgotStatus !== 'sending' && <ArrowRight className="w-4 h-4" />}
                </button>

                <button type="button" onClick={closeForgot} className="w-full text-center text-xs font-bold text-gold-300 hover:text-gold-200 transition">
                  Back to sign in
                </button>
              </form>
            ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4 text-sm">
              {isRegister && (
                <>
                  <div>
                    <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Your Full Name</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={inputName}
                        onChange={(e) => setInputName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
                        placeholder="e.g. Ganesh"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Mobile Number</label>
                    <div className="relative">
                      <MessageCircle className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={inputPhone}
                        onChange={(e) => setInputPhone(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
                        placeholder="10-digit number"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Username</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={inputUser}
                    onChange={(e) => setInputUser(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-cream-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={inputPass}
                    onChange={(e) => setInputPass(e.target.value)}
                    className="w-full pl-11 pr-12 py-3 bg-night-850 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
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

              {!isRegister && (
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-cream-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded accent-gold-500"
                    />
                    Remember me
                  </label>
                  <button type="button" onClick={() => setForgotOpen(true)} className="font-semibold text-gold-300 hover:text-gold-200 transition">
                    Forgot password?
                  </button>
                </div>
              )}

              {authErrorMsg && (
                <div className="p-3 rounded-xl bg-burgundy-600/20 border border-burgundy-400/40 text-burgundy-400 text-[11px] font-semibold">
                  {authErrorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full py-3.5 rounded-full font-bold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.99] bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 hover:brightness-110"
              >
                {isAuthenticating ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
                {!isAuthenticating && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
            )}

            {!forgotOpen && (
              <p className="mt-5 text-center text-xs text-cream-400">
                {isRegister ? 'Already have an account?' : 'New to House of Flavours?'}{' '}
                <button
                  type="button"
                  onClick={() => setAuthAction(isRegister ? 'login' : 'register')}
                  className="font-bold text-gold-300 hover:text-gold-200 transition"
                >
                  {isRegister ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            )}

            <div className="mt-6 pt-5 border-t border-gold-500/10 text-center">
              <button
                type="button"
                onClick={onStaffPortal}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-cream-500 hover:text-gold-300 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Staff sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
