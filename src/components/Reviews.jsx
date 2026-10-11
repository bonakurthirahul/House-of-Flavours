import { siteConfig } from '../config.js';
import { Star } from './icons.jsx';
import { Reveal } from './Reveal.jsx';

export function Reviews() {
  const reviews = siteConfig.reviews || [];

  return (
    <section id="reviews" className="relative scroll-mt-24 border-y border-gold-500/10 bg-night-900 overflow-hidden">
      <div aria-hidden="true" className="absolute -top-24 left-1/3 w-80 h-80 rounded-full bg-burgundy-600/20 blur-[110px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Reveal className="text-center max-w-2xl mx-auto">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-gold-400">Testimonials</span>
          <h2 className="mt-4 font-display text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-cream-100">
            Words From Our <span className="text-gradient-gold">Guests</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-cream-300/80">What our guests say about their experience with us.</p>
        </Reveal>

        {reviews.length === 0 ? (
          <div className="mt-12 max-w-xl mx-auto glass rounded-3xl p-10 text-center">
            <p className="text-sm text-cream-400">No customer reviews available yet.</p>
            <p className="text-[11px] text-cream-500 mt-1">Reviews will appear here once customers share their feedback.</p>
          </div>
        ) : (
          <>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 perspective-near">
              {reviews.map((r, idx) => (
                <Reveal key={idx} delay={idx * 120} className="h-full">
                  <figure className="tilt-card relative glass rounded-3xl p-6 h-full flex flex-col backface-hidden">
                    <span aria-hidden="true" className="absolute -top-4 left-6 font-display text-6xl leading-none text-gold-500/25 select-none">&ldquo;</span>
                    <div className="flex items-center justify-between relative">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-4 h-4 ${i < r.rating ? 'text-gold-400' : 'text-night-600'}`} />
                        ))}
                      </div>
                      {r.sample && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-cream-400 bg-night-700 px-2 py-0.5 rounded-md">
                          Sample
                        </span>
                      )}
                    </div>
                    <blockquote className="mt-4 text-sm text-cream-200/90 leading-relaxed flex-1">"{r.text}"</blockquote>
                    <figcaption className="mt-5 pt-4 border-t border-gold-500/10 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-night-950 font-bold flex items-center justify-center text-sm">
                        {r.name?.charAt(0) || 'G'}
                      </span>
                      <span className="text-xs font-bold text-cream-100">{r.name}</span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>
            <p className="mt-8 text-center text-[11px] text-cream-500">
              Sample placeholders shown. Replace them with genuine customer reviews in{' '}
              <code className="bg-night-800 border border-gold-500/15 px-1.5 py-0.5 rounded text-gold-300">src/config.js</code>.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
