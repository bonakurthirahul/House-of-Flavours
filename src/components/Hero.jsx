import { useEffect, useRef } from 'react';
import { siteConfig } from '../config.js';
import { MessageCircle, Leaf, Flame, Sparkle, Star, Clock, ArrowRight } from './icons.jsx';

const FLOATERS = [
  { Icon: Flame, className: 'left-[4%] top-[20%] w-12 h-12', depth: 40, anim: 'animate-float-slow', tone: 'text-burgundy-400' },
  { Icon: Leaf, className: 'left-[10%] bottom-[18%] w-11 h-11', depth: 26, anim: 'animate-float', tone: 'text-emerald-400' },
  { Icon: Sparkle, className: 'right-[6%] top-[14%] w-10 h-10', depth: 34, anim: 'animate-float-fast', tone: 'text-gold-400' },
  { Icon: Sparkle, className: 'left-[46%] top-[8%] w-7 h-7 hidden sm:flex', depth: 20, anim: 'animate-float', tone: 'text-gold-300' }
];

export function Hero({ onExploreMenu, onContact }) {
  const sectionRef = useRef(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.setProperty('--mx', (x * 2).toFixed(3));
      el.style.setProperty('--my', (y * 2).toFixed(3));
    };
    const onLeave = () => {
      el.style.setProperty('--mx', '0');
      el.style.setProperty('--my', '0');
    };

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <section
      id="home"
      ref={sectionRef}
      className="relative overflow-hidden scroll-mt-24 min-h-[calc(100vh-4.75rem)] flex items-center"
    >
      {/* Ambient background */}
      <div aria-hidden="true" className="absolute inset-0 grid-lines opacity-40 pointer-events-none" />
      <div aria-hidden="true" className="absolute -top-40 -left-40 w-[38rem] h-[38rem] rounded-full bg-gold-500/10 blur-[120px] animate-glow pointer-events-none" />
      <div aria-hidden="true" className="absolute -bottom-52 right-0 w-[34rem] h-[34rem] rounded-full bg-burgundy-600/25 blur-[120px] pointer-events-none" />

      {/* Floating ingredients */}
      {FLOATERS.map(({ Icon, className, depth, anim, tone }, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`hero-layer absolute ${className} ${anim} items-center justify-center rounded-2xl glass hidden md:flex`}
          style={{ '--depth': depth, '--rot': `${i * 3 - 4}deg` }}
        >
          <Icon className={`w-5 h-5 ${tone}`} />
        </div>
      ))}

      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-16 items-center">

        {/* Copy */}
        <div className="hero-layer" style={{ '--depth': 8 }}>
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-gold-300 border border-gold-500/30 bg-gold-500/5 px-4 py-2 rounded-full">
            <Sparkle className="w-3.5 h-3.5" /> Authentic Kitchen · Est. With Love
          </span>

          <h1 className="mt-6 font-display text-4xl sm:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.04] text-cream-100">
            Where Every Bite <br className="hidden sm:block" />
            Becomes an <span className="text-gradient-gold animate-shimmer">Experience</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-cream-300/90 leading-relaxed max-w-xl">
            Slow-cooked dum biryani, smoky charcoal kebabs and rich house curries — crafted with
            aromatic spices and served hot, the way flavour was meant to be.
          </p>

          <div className="mt-8 flex flex-wrap gap-3.5">
            <button
              onClick={onExploreMenu}
              className="group px-7 py-3.5 rounded-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 font-bold text-sm shadow-[0_18px_40px_-16px_rgba(212,175,55,0.9)] hover:brightness-110 active:scale-95 transition flex items-center gap-2"
            >
              Explore Our Menu
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
            <button
              onClick={onContact}
              className="px-7 py-3.5 rounded-full border border-gold-500/30 text-cream-100 font-bold text-sm hover:bg-gold-500/10 hover:border-gold-400 active:scale-95 transition flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4 text-gold-400" /> Contact Us
            </button>
          </div>

          <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
            {[
              { label: 'Handcrafted Dishes', value: '125+' },
              { label: 'Pure Halal Kitchen', value: '100%' },
              { label: 'Freshly Cooked', value: 'Daily' }
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl px-3 py-3.5 text-center">
                <div className="font-display text-xl font-bold text-gradient-gold">{s.value}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-cream-400 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 3D dish showcase */}
        <div className="relative hero-layer" style={{ '--depth': 14 }}>
          <div className="perspective">
            <div className="relative preserve-3d rotate-[-1.5deg]">
              <div aria-hidden="true" className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-gold-500/25 via-transparent to-burgundy-500/25 blur-3xl" />
              <div aria-hidden="true" className="absolute -inset-10 rounded-full border border-gold-500/20 animate-spin-slow" />
              <div aria-hidden="true" className="absolute -inset-16 rounded-full border border-gold-500/10 animate-spin-slow" style={{ animationDirection: 'reverse' }} />

              <img
                src={siteConfig.heroImage}
                alt="Freshly prepared signature dish at House of Flavours"
                className="relative w-full h-[19rem] sm:h-[27rem] object-cover rounded-[2rem] border border-gold-500/25 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.95)]"
                loading="eager"
              />

              {/* Floating badges */}
              <div className="hero-layer absolute -left-5 top-8 glass rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2.5" style={{ '--depth': 30 }}>
                <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Leaf className="w-4 h-4 text-emerald-400" />
                </span>
                <div>
                  <div className="text-xs font-bold text-cream-100 leading-none">100% Halal</div>
                  <div className="text-[10px] text-cream-400 mt-0.5">Certified kitchen</div>
                </div>
              </div>

              <div className="hero-layer absolute -right-4 bottom-10 glass rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2.5" style={{ '--depth': 24 }}>
                <span className="w-9 h-9 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
                  <Star className="w-4 h-4 text-gold-400" />
                </span>
                <div>
                  <div className="text-xs font-bold text-cream-100 leading-none">4.9 / 5.0</div>
                  <div className="text-[10px] text-cream-400 mt-0.5">Loved by guests</div>
                </div>
              </div>

              <div className="hero-layer absolute right-8 -top-4 glass rounded-full px-4 py-2 shadow-xl flex items-center gap-2" style={{ '--depth': 36 }}>
                <Clock className="w-3.5 h-3.5 text-gold-400" />
                <span className="text-[11px] font-bold text-cream-100">Ready in 30 min</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
