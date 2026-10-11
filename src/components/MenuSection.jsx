import { CATEGORIES } from '../constants.js';
import { DishCard } from './DishCard.jsx';
import { Reveal } from './Reveal.jsx';
import { Sparkle } from './icons.jsx';

export function MenuSection({
  dishes,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  cart,
  isStoreOpen,
  onAdd,
  onUpdate,
  onOrderNow
}) {
  return (
    <section id="menu" className="relative scroll-mt-24 overflow-hidden">
      <div aria-hidden="true" className="absolute top-24 right-0 w-96 h-96 rounded-full bg-gold-500/8 blur-[110px] pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">

        <Reveal className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-gold-400">
            <Sparkle className="w-3.5 h-3.5" /> Our Menu
          </span>
          <h2 className="mt-4 font-display text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-cream-100">
            Crafted to <span className="text-gradient-gold">Delight</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-cream-300/80">
            Explore biryani, curries, breads, desserts and more — freshly prepared favourites.
          </p>
        </Reveal>

        {/* Filters: search + category / food-type tabs */}
        <Reveal delay={80} className="mt-10">
          <div className="glass rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Search dishes..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="flex-1 px-4 py-2.5 text-sm bg-night-850 border border-gold-500/15 rounded-full outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => onSelectCategory(cat)}
                  className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-gradient-to-r from-gold-300 to-gold-500 text-night-950 border-transparent shadow-[0_10px_25px_-14px_rgba(212,175,55,0.9)]'
                      : 'bg-night-850 text-cream-300 border-gold-500/15 hover:border-gold-500/40'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Results label */}
        <div className="mt-8 mb-5 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-cream-400">
            {dishes.length} {dishes.length === 1 ? 'dish' : 'dishes'}
            <span className="text-gold-300"> · {selectedCategory}</span>
          </span>
          <button onClick={onOrderNow} className="text-xs font-bold text-gold-300 underline underline-offset-4 hover:text-gold-200 transition">
            View cart
          </button>
        </div>

        {dishes.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center text-sm text-cream-400">
            No dishes match your search or filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {dishes.map((dish) => (
              <DishCard
                key={dish.id}
                dish={dish}
                qty={cart.find((c) => c.id === dish.id)?.quantity || 0}
                isStoreOpen={isStoreOpen}
                onAdd={onAdd}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}