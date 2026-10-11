import { useState } from 'react';
import { Plus, Minus, Star, DietIcon } from './icons.jsx';

export function DishCard({ dish, qty, isStoreOpen, onAdd, onUpdate }) {
  const [imgError, setImgError] = useState(false);

  const imgSrc = imgError ? '/placeholder.svg' : dish.image;

  return (
    <div className="group relative bg-night-850 rounded-2xl border border-gold-500/12 overflow-hidden shadow-[0_20px_45px_-30px_rgba(0,0,0,0.9)] hover:border-gold-500/30 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between">
      <div className="relative h-40 w-full overflow-hidden bg-night-800">
        <img
          src={imgSrc}
          alt={dish.name}
          loading="lazy"
          onError={() => { if (!imgError) setImgError(true); }}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-night-950/70 via-transparent to-transparent" />

        {dish.badge && (
          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-gold-300 to-gold-500 text-night-950 shadow-md">
            {dish.badge}
          </span>
        )}
        {dish.rating && (
          <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full glass text-cream-100 text-[10px] font-bold flex items-center gap-1">
            <Star className="w-3 h-3 text-gold-400" />
            <span>{dish.rating}</span>
          </div>
        )}
        <div className="absolute bottom-2.5 right-2.5">
          <DietIcon isVeg={dish.isVeg} />
        </div>
      </div>

      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-gold-400/90 uppercase tracking-wider truncate">{dish.category}</span>
          <span className="font-display text-lg font-bold text-gradient-gold shrink-0">₹{dish.price}</span>
        </div>
        <h3 className="mt-1 font-bold text-cream-100 text-sm leading-snug line-clamp-1" title={dish.name}>{dish.name}</h3>
        <p className="mt-1 text-[11px] text-cream-400 line-clamp-2 leading-relaxed">{dish.description}</p>

        <div className="mt-3 pt-3 border-t border-gold-500/10 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${dish.isVeg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {dish.isVeg ? 'Vegetarian' : 'Non-Veg'}
          </span>
          {qty === 0 ? (
            <button
              disabled={!isStoreOpen || !dish.isAvailable}
              onClick={() => onAdd(dish)}
              className="px-4 py-1.5 rounded-full text-xs font-bold text-night-950 bg-gradient-to-r from-gold-300 to-gold-500 hover:brightness-110 active:scale-95 transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{dish.isAvailable ? 'ADD' : 'SOLD OUT'}</span>
            </button>
          ) : (
            <div className="flex items-center bg-gradient-to-r from-gold-300 to-gold-500 text-night-950 rounded-full px-1.5 py-1 shadow-md">
              <button onClick={() => onUpdate(dish.id, -1)} className="w-6 h-6 flex items-center justify-center font-bold active:scale-90 transition" aria-label="Decrease quantity">
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-xs font-black px-2 min-w-4 text-center">{qty}</span>
              <button onClick={() => onUpdate(dish.id, 1)} className="w-6 h-6 flex items-center justify-center font-bold active:scale-90 transition" aria-label="Increase quantity">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}