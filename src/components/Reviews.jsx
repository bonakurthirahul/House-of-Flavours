import { useCallback, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase.js';
import {
  loadApprovedReviews,
  loadReviewableOrders,
  loadReviewedOrderIds,
  submitReview
} from '../lib/dbService.js';
import { Star, Check, ArrowRight } from './icons.jsx';
import { Reveal } from './Reveal.jsx';

// How many review cards to show before the "View All Reviews" expands the list.
const INITIAL_VISIBLE = 6;

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

// Read-only 5-star display (rounds to the nearest whole star).
function Stars({ value = 0, className = 'w-4 h-4' }) {
  const filled = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${Number(value).toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`${className} ${i < filled ? 'text-gold-400' : 'text-night-600'}`} />
      ))}
    </span>
  );
}

export function Reviews({ currentUser, onLogin }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // Write-a-review modal
  const [modalOpen, setModalOpen] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [form, setForm] = useState({ orderId: '', rating: 0, title: '', comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadReviews = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError('Reviews are temporarily unavailable.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await loadApprovedReviews();
      setReviews(
        rows.map((r) => ({
          id: r.id,
          rating: Number(r.rating) || 0,
          title: r.title || '',
          comment: r.comment || '',
          label: r.reviewer_label || 'Guest',
          createdAt: r.created_at
        }))
      );
    } catch (err) {
      setError(err.message || 'Could not load reviews right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const count = reviews.length;
  const average = useMemo(
    () => (count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0),
    [reviews, count]
  );
  const visible = showAll ? reviews : reviews.slice(0, INITIAL_VISIBLE);
  const hasMore = reviews.length > INITIAL_VISIBLE;

  const loadEligibleOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const [orders, reviewedIds] = await Promise.all([
        loadReviewableOrders(currentUser.id),
        loadReviewedOrderIds(currentUser.id)
      ]);
      const reviewed = new Set(reviewedIds);
      const eligible = orders.filter((o) => !reviewed.has(o.order_id));
      setEligibleOrders(eligible);
      setForm((f) => ({ ...f, orderId: eligible.length ? eligible[0].order_id : '' }));
    } catch (err) {
      setOrdersError(err.message || 'Could not check your completed orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, [currentUser]);

  const openReviewForm = () => {
    setJustSubmitted(false);
    if (!currentUser) {
      if (onLogin) onLogin();
      return;
    }
    setForm({ orderId: '', rating: 0, title: '', comment: '' });
    setSubmitError('');
    setEligibleOrders([]);
    setModalOpen(true);
    loadEligibleOrders();
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  // Close on Escape; keep the body from scrolling behind the modal.
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, submitting]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (!form.rating || form.rating < 1 || form.rating > 5) {
      setSubmitError('Please choose a star rating from 1 to 5.');
      return;
    }
    if (!form.comment.trim()) {
      setSubmitError('Please write a short review before submitting.');
      return;
    }
    if (!form.orderId) {
      setSubmitError('Please select the order you are reviewing.');
      return;
    }

    setSubmitting(true);
    try {
      await submitReview({
        orderId: form.orderId,
        rating: form.rating,
        title: form.title.trim(),
        comment: form.comment.trim()
      });
      setModalOpen(false);
      setShowAll(false);
      setJustSubmitted(true);
      await loadReviews();
    } catch (err) {
      // Keep the user's input so they can fix and retry.
      setSubmitError(err.message || 'Sorry, your review could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const canReview = Boolean(currentUser);
  const noEligibleOrders = !ordersLoading && !ordersError && eligibleOrders.length === 0;

  return (
    <section id="reviews" className="relative scroll-mt-24 border-y border-gold-500/10 bg-night-900 overflow-hidden">
      <div aria-hidden="true" className="absolute -top-24 left-1/3 w-80 h-80 rounded-full bg-burgundy-600/20 blur-[110px]" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <Reveal className="text-center max-w-2xl mx-auto">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-gold-400">Testimonials</span>
          <h2 className="mt-4 font-display text-3xl sm:text-4xl xl:text-5xl font-bold tracking-tight text-cream-100">
            What Our Customers <span className="text-gradient-gold">Say</span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-cream-300/80">
            Genuine ratings and reviews from verified guests of House of Flavours.
          </p>
        </Reveal>

        {/* Summary + Write a Review */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-8">
          <div className="glass rounded-2xl px-6 py-4 flex items-center gap-4">
            <div className="text-center">
              <div className="font-display text-3xl font-bold text-gradient-gold leading-none">
                {count ? average.toFixed(1) : '—'}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-cream-500">out of 5</div>
            </div>
            <div className="w-px h-12 bg-gold-500/15" />
            <div>
              <Stars value={average} className="w-5 h-5" />
              <div className="mt-1.5 text-xs text-cream-400">
                {count ? `${count} ${count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openReviewForm}
            className="px-6 py-3.5 rounded-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 font-bold text-sm hover:brightness-110 active:scale-[0.99] transition flex items-center gap-2"
          >
            <Star className="w-4 h-4" />
            Write a Review
          </button>
        </div>

        {justSubmitted && (
          <div className="mt-6 max-w-xl mx-auto p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold text-center">
            Thank you! Your review has been posted.
          </div>
        )}

        {/* Body states */}
        {loading ? (
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-3xl p-6 animate-pulse">
                <div className="h-4 w-24 bg-night-700 rounded" />
                <div className="mt-4 h-3 w-full bg-night-700 rounded" />
                <div className="mt-2 h-3 w-5/6 bg-night-700 rounded" />
                <div className="mt-5 pt-4 border-t border-gold-500/10 h-6 w-28 bg-night-700 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="mt-12 max-w-xl mx-auto glass rounded-3xl p-10 text-center">
            <p className="text-sm text-cream-300">{error}</p>
            <button
              type="button"
              onClick={loadReviews}
              className="mt-4 px-5 py-2.5 rounded-full border border-gold-500/30 text-gold-300 text-xs font-bold hover:bg-gold-500/10 transition"
            >
              Try again
            </button>
          </div>
        ) : count === 0 ? (
          <div className="mt-12 max-w-xl mx-auto glass rounded-3xl p-10 text-center">
            <Star className="w-8 h-8 text-gold-500/40 mx-auto" />
            <p className="mt-3 text-base font-semibold text-cream-100">Be the first to share your experience!</p>
            <p className="mt-1 text-[12px] text-cream-400">
              Ordered from us? Your honest review helps other guests discover House of Flavours.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 perspective-near">
              {visible.map((r, idx) => (
                <Reveal key={r.id} delay={idx * 80} className="h-full">
                  <figure className="tilt-card relative glass rounded-3xl p-6 h-full flex flex-col backface-hidden">
                    <span aria-hidden="true" className="absolute -top-4 left-6 font-display text-6xl leading-none text-gold-500/25 select-none">&ldquo;</span>
                    <div className="flex items-center justify-between relative">
                      <Stars value={r.rating} />
                      <time dateTime={r.createdAt} className="text-[10px] font-semibold uppercase tracking-wider text-cream-500">
                        {formatDate(r.createdAt)}
                      </time>
                    </div>
                    {r.title && (
                      <h3 className="mt-4 font-display text-base font-bold text-cream-100">{r.title}</h3>
                    )}
                    <blockquote className="mt-3 text-sm text-cream-200/90 leading-relaxed flex-1">"{r.comment}"</blockquote>
                    <figcaption className="mt-5 pt-4 border-t border-gold-500/10 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 text-night-950 font-bold flex items-center justify-center text-sm">
                        {r.label?.charAt(0)?.toUpperCase() || 'G'}
                      </span>
                      <span className="text-xs font-bold text-cream-100">{r.label}</span>
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400/80">
                        <Check className="w-3 h-3" /> Verified
                      </span>
                    </figcaption>
                  </figure>
                </Reveal>
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  className="px-6 py-2.5 rounded-full border border-gold-500/25 text-gold-300 text-xs font-bold hover:bg-gold-500/10 transition"
                >
                  {showAll ? 'Show fewer reviews' : `View All Reviews (${count})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* WRITE A REVIEW MODAL */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
            className="glass rounded-3xl max-w-md w-full p-6 sm:p-7 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="review-modal-title" className="font-display text-xl font-bold text-cream-100">Write a Review</h3>
                <p className="mt-1 text-xs text-cream-400">Share your experience with other guests.</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close review form"
                className="text-cream-400 hover:text-cream-100 text-xl leading-none disabled:opacity-50"
              >
                &times;
              </button>
            </div>

            {ordersLoading ? (
              <p className="mt-8 text-sm text-cream-400 text-center">Checking your completed orders…</p>
            ) : ordersError ? (
              <div className="mt-6">
                <p className="text-sm text-burgundy-400">{ordersError}</p>
                <button
                  type="button"
                  onClick={loadEligibleOrders}
                  className="mt-4 px-5 py-2.5 rounded-full border border-gold-500/30 text-gold-300 text-xs font-bold hover:bg-gold-500/10 transition"
                >
                  Try again
                </button>
              </div>
            ) : noEligibleOrders ? (
              <div className="mt-6 p-4 rounded-2xl bg-night-850 border border-gold-500/15">
                <p className="text-sm text-cream-200">You can write a review once you have a completed (Delivered) order.</p>
                <p className="mt-1 text-[11px] text-cream-500">
                  {canReview
                    ? 'Ordered before? It will appear here as soon as it is marked Delivered.'
                    : 'Please sign in to continue.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Which order?</label>
                  <select
                    value={form.orderId}
                    onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
                    className="w-full px-4 py-3 text-sm bg-night-900 border border-gold-500/15 rounded-xl outline-none text-cream-100 focus:border-gold-500/50 transition"
                  >
                    {eligibleOrders.map((o) => (
                      <option key={o.order_id} value={o.order_id}>
                        #{o.order_id}{o.items_summary ? ` — ${o.items_summary}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-cream-300 block mb-1.5">Your rating *</span>
                  <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Star rating">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const value = i + 1;
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={form.rating === value}
                          aria-label={`${value} star${value > 1 ? 's' : ''}`}
                          onClick={() => setForm((f) => ({ ...f, rating: value }))}
                          className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/50"
                        >
                          <Star className={`w-7 h-7 transition ${value <= form.rating ? 'text-gold-400' : 'text-night-600 hover:text-gold-500/60'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Title <span className="text-cream-500 font-normal">(optional)</span></label>
                  <input
                    type="text"
                    value={form.title}
                    maxLength={120}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Summarise your experience"
                    className="w-full px-4 py-3 text-sm bg-night-900 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-cream-300 block mb-1.5">Your review *</label>
                  <textarea
                    value={form.comment}
                    maxLength={2000}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    rows="4"
                    placeholder="Tell us what you loved…"
                    className="w-full px-4 py-3 text-sm bg-night-900 border border-gold-500/15 rounded-xl outline-none text-cream-100 placeholder:text-cream-500 focus:border-gold-500/50 transition resize-none"
                  ></textarea>
                </div>

                {submitError && (
                  <div className="p-3 rounded-xl bg-burgundy-600/20 border border-burgundy-400/40 text-burgundy-400 text-xs font-semibold">
                    {submitError}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="flex-1 py-3 rounded-full border border-gold-500/20 text-cream-200 font-bold text-sm hover:bg-night-850 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3 rounded-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-400 text-night-950 font-bold text-sm hover:brightness-110 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <ArrowRight className="w-4 h-4" />
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
