import { useEffect, useState } from 'react';
import { siteConfig } from '../config.js';
import { BrandLogo } from './BrandLogo.jsx';
import { ShoppingBag, UserIcon, ShieldCheck } from './icons.jsx';

const NAV_LINKS = [
  { label: 'Home', id: 'home' },
  { label: 'About Us', id: 'about' },
  { label: 'Our Menu', id: 'menu' },
  { label: 'Reviews', id: 'reviews' },
  { label: 'Contact', id: 'contact' }
];

export function Navbar({ onNavigate, onOrderNow, onOpenCart, onOpenOrders, onLogin, onLogout, onOpenStaff, currentUser, totalCartCount }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNav = (id) => {
    setMobileOpen(false);
    onNavigate(id);
  };

  const isStaff = currentUser?.role === 'staff';
  const userInitial = (currentUser?.name || currentUser?.username || 'G').charAt(0).toUpperCase();

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled ? 'glass shadow-[0_18px_50px_-30px_rgba(0,0,0,0.9)]' : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-3">

          {/* Brand */}
          <button onClick={() => handleNav('home')} className="flex items-center gap-2.5 cursor-pointer text-left group min-w-0">
            <BrandLogo className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 transition-transform duration-500 group-hover:rotate-[8deg]" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg sm:text-xl font-bold tracking-tight text-cream-100 leading-none truncate">
                  House of <span className="text-gradient-gold">Flavours</span>
                </span>
                <span className="hidden sm:inline text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-bold px-1.5 py-0.5 rounded-full tracking-wide shrink-0">
                  100% HALAL
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-cream-400 font-medium tracking-widest uppercase">
                Dum Biryani &amp; Kebabs
              </p>
            </div>
          </button>

          {/* Desktop links */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNav(link.id)}
                className="relative px-3.5 py-2 text-sm font-semibold text-cream-200/85 hover:text-gold-300 transition-colors group whitespace-nowrap"
              >
                {link.label}
                <span className="absolute left-1/2 -translate-x-1/2 bottom-1 h-px w-0 bg-gold-400 transition-all duration-300 group-hover:w-6" />
              </button>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <button
              onClick={onOrderNow}
              className="px-5 py-2.5 rounded-full text-sm font-bold text-night-950 bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 hover:brightness-110 shadow-[0_10px_30px_-12px_rgba(212,175,55,0.8)] active:scale-95 transition whitespace-nowrap"
            >
              Order Now
            </button>
            <button
              onClick={onOpenOrders}
              className="px-3 py-2.5 text-sm font-semibold text-cream-200 hover:text-gold-300 transition-colors"
            >
              Orders
            </button>
            <button
              onClick={onOpenCart}
              className="px-4 py-2.5 rounded-full text-sm font-bold border border-gold-500/30 text-cream-100 flex items-center gap-2 hover:border-gold-400 hover:bg-gold-500/10 transition"
              aria-label="Open cart"
            >
              <ShoppingBag className="w-4 h-4 text-gold-400" />
              <span>{totalCartCount}</span>
            </button>
            <span aria-hidden="true" className="w-px h-6 bg-gold-500/20 mx-1" />

            {currentUser ? (
              <>
                {isStaff && (
                  <button
                    onClick={onOpenStaff}
                    className="px-4 py-2.5 rounded-full text-sm font-bold bg-burgundy-600 text-cream-100 flex items-center gap-1.5 hover:bg-burgundy-500 transition"
                    aria-label="Open kitchen dashboard"
                  >
                    <ShieldCheck className="w-4 h-4 text-gold-300" />
                    <span>Kitchen</span>
                  </button>
                )}

                {/* Account cluster: avatar + name + logout */}
                <div className="flex items-center gap-1.5 border border-gold-500/15 rounded-full pl-1.5 pr-1 py-1 bg-night-800/60" title={currentUser.name || currentUser.username}>
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-night-950 font-bold text-xs flex items-center justify-center shrink-0">
                    {userInitial}
                  </span>
                  <span className={`text-sm font-semibold text-cream-200 ${isStaff ? 'text-burgundy-400' : ''} truncate max-w-[120px]`}>
                    {currentUser.name || currentUser.username}
                  </span>
                  <span aria-hidden="true" className="w-px h-5 bg-gold-500/15" />
                  <button
                    onClick={onLogout}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-cream-300 hover:text-cream-100 hover:bg-gold-500/10 transition"
                    aria-label="Log out"
                  >
                    ✕
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={onLogin}
                className="px-4 py-2.5 rounded-full text-sm font-bold border border-gold-500/30 text-gold-300 flex items-center gap-1.5 hover:bg-gold-500/10 transition"
              >
                <UserIcon className="w-4 h-4" />
                <span>Login</span>
              </button>
            )}
          </div>

          {/* Mobile actions */}
          <div className="flex lg:hidden items-center gap-2 shrink-0">
            {currentUser && (
              isStaff ? (
                <button
                  onClick={onOpenStaff}
                  className="w-9 h-9 rounded-full bg-burgundy-600 text-cream-100 flex items-center justify-center"
                  aria-label="Open kitchen dashboard"
                >
                  <ShieldCheck className="w-4 h-4 text-gold-300" />
                </button>
              ) : (
                <span className="w-9 h-9 rounded-full border border-gold-500/20 bg-night-800 text-gold-300 font-bold text-xs flex items-center justify-center" aria-label={`Account: ${currentUser.name}`}>
                  {userInitial}
                </span>
              )
            )}
            <button
              onClick={onOpenCart}
              className="px-3 py-2 rounded-full text-xs font-bold border border-gold-500/30 text-cream-100 flex items-center gap-1.5"
              aria-label="Open cart"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-gold-400" />
              <span>{totalCartCount}</span>
            </button>
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-gold-500/30 text-cream-100"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                {mobileOpen ? (
                  <>
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <nav className="lg:hidden pb-5 space-y-1 glass rounded-2xl mb-3 p-3">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNav(link.id)}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-cream-200 hover:bg-gold-500/10 hover:text-gold-300 transition"
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={() => { setMobileOpen(false); onOrderNow(); }}
              className="w-full px-3 py-2.5 rounded-xl text-sm font-bold text-night-950 bg-gradient-to-r from-gold-300 to-gold-500 text-center"
            >
              Order Now
            </button>
            <button
              onClick={() => { setMobileOpen(false); onOpenOrders(); }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold text-cream-200 hover:bg-gold-500/10"
            >
              My Orders
            </button>
            {currentUser ? (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <span className="font-display text-base font-bold text-cream-100 truncate">{currentUser.name || currentUser.username}</span>
                  <button onClick={() => { setMobileOpen(false); onLogout(); }} className="ml-auto px-3.5 py-2 rounded-xl text-sm font-bold border border-night-700 text-cream-300">
                    Log out
                  </button>
                </div>
                {isStaff && (
                  <button
                    onClick={() => { setMobileOpen(false); onOpenStaff(); }}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-bold bg-burgundy-600 text-cream-100 flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-gold-300" /> Kitchen Dashboard
                  </button>
                )}
              </>
            ) : (
              <button onClick={() => { setMobileOpen(false); onLogin(); }} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold border border-gold-500/30 text-gold-300 flex items-center justify-center gap-1.5">
                <UserIcon className="w-4 h-4" /> Login / Register
              </button>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}