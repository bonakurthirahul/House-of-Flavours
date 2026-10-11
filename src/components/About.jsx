import { siteConfig } from '../config.js';
import { Reveal } from './Reveal.jsx';
import { Flame, Leaf, Sparkle, Clock, Check } from './icons.jsx';

const VALUES = [
  { title: 'Taste First', text: 'Recipes built around bold, balanced flavours our guests come back for.' },
  { title: 'Freshness', text: 'Dishes are prepared to order so every plate arrives hot and fresh.' },
  { title: 'Quality Ingredients', text: 'Carefully sourced produce and aromatic house spices in every recipe.' },
  { title: 'Customer Satisfaction', text: 'Friendly service and consistent quality, from the first order to the last bite.' }
];

export function About() {
  return (
    <section id="about" className="relative scroll-mt-24 border-y border-gold-500/10 bg-night-900 overflow-hidden">
      <div aria-hidden="true" className="absolute top-1/2 -left-24 w-80 h-80 rounded-full bg-burgundy-600/20 blur-[100px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

        {/* Image */}
        <Reveal className="relative order-1 lg:order-none">
          <div className="perspective-near">
            <div className="relative preserve-3d">
              <div aria-hidden="true" className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-gold-500/20 to-transparent blur-2xl" />
              <img
                src={siteConfig.aboutImage}
                alt="Our kitchen preparing fresh food"
                className="relative w-full h-72 sm:h-96 object-cover rounded-[2rem] border border-gold-500/20 shadow-2xl"
                loading="lazy"
              />
              <div className="absolute -bottom-6 -right-4 sm:-right-6 glass rounded-2xl px-5 py-4 shadow-2xl">
                <div className="font-display text-3xl font-bold text-gradient-gold leading-none">12+</div>
                <div className="mt-1 text-[11px] font-semibold text-cream-400 uppercase tracking-wide">Years of flavour</div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Copy */}
        <Reveal delay={120}>
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-gold-400">About Us</span>
          <h2 className="mt-4 font-display text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-cream-100 leading-tight">
            More Than Food.<br />
            It&apos;s an <span className="text-gradient-gold">Experience.</span>
          </h2>
          <p className="mt-5 text-sm sm:text-base text-cream-300/85 leading-relaxed">
            {siteConfig.brandName} is devoted to the craft of great food — slow-cooked dum biryani,
            smoky tandoor kebabs and rich, aromatic curries. We obsess over taste, freshness and
            quality so that every order becomes a moment worth gathering for.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            {VALUES.map((v, i) => (
              <div key={v.title} className="group glass rounded-2xl p-5 transition hover:border-gold-500/40 hover:-translate-y-1 duration-300">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-gold-500/10 border border-gold-500/25 flex items-center justify-center">
                    {i === 0 ? <Flame className="w-3.5 h-3.5 text-gold-400" /> : i === 1 ? <Leaf className="w-3.5 h-3.5 text-emerald-400" /> : i === 2 ? <Sparkle className="w-3.5 h-3.5 text-gold-300" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </span>
                  <h3 className="font-bold text-cream-100 text-sm">{v.title}</h3>
                </div>
                <p className="mt-2 text-[13px] text-cream-400 leading-relaxed">{v.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-3 text-xs text-cream-400">
            <Clock className="w-4 h-4 text-gold-400" />
            <span>{siteConfig.hours}</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
