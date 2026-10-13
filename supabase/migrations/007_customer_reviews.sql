-- =============================================================
-- House of Flavours — 007 customer reviews & ratings
-- Run after 001, 002, 003, 004, 005 and 006.
-- Idempotent: safe to re-run.
--
-- What this migration does (and does NOT do):
--   * Adds public.reviews: one row per customer order review, with a 1-5
--     rating, optional title, comment, a privacy-safe display label and an
--     optional moderation status ('pending' | 'approved' | 'rejected').
--   * Enables Row Level Security. Approved reviews are publicly readable; a
--     customer can also read their own rows (any status). Staff can read and
--     moderate; only managers can delete. There is NO direct INSERT policy —
--     reviews are created exclusively through the validated
--     public.submit_review() security-definer function.
--   * submit_review() requires an authenticated customer, a rating 1-5, a
--     non-empty comment, an order that BELONGS to the caller AND is in the
--     'Delivered' status, and prevents duplicate reviews for the same order.
--     The public display name is derived server-side from the caller's own
--     profile (never from client input), so no email/phone is ever exposed.
--   * Does NOT collect GST/delivery, touch orders, disable RLS, drop/alter
--     existing tables, delete data, or expose any privileged key.
--
-- NOTE: creating this SQL file alone does NOT apply it. It must be run once
-- in the Supabase SQL Editor (Dashboard > SQL Editor > New query) before the
-- reviews section can read/write real data. Until then the customer reviews
-- section shows its empty/error state and never fake reviews.
-- =============================================================

-- ------------------------------------------------------------------
-- 1. reviews table
-- ------------------------------------------------------------------
create table if not exists public.reviews (
  id                bigserial primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Nullable so a review survives staff cleanup of an old order
  -- (orders deletion sets this to NULL rather than removing the review).
  order_id          text references public.orders (order_id) on delete set null,
  rating            int  not null check (rating between 1 and 5),
  title             text not null default '',
  comment           text not null,
  -- Privacy-safe display name resolved from the reviewer's own profile.
  reviewer_label    text not null default 'Guest',
  moderation_status text not null default 'approved'
                      check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at        timestamptz not null default now()
);

comment on column public.reviews.reviewer_label is
  'Privacy-safe display name derived server-side from public.profiles; no email/phone is stored or exposed.';
comment on column public.reviews.moderation_status is
  'Only approved reviews are shown publicly. Defaults to approved so genuine reviews appear immediately; staff can set pending/rejected to hide one.';

-- Newest-first reads.
create index if not exists reviews_created_at_idx
  on public.reviews (created_at desc);

-- One review per customer per order (duplicate prevention).
create unique index if not exists reviews_user_order_uidx
  on public.reviews (user_id, order_id)
  where order_id is not null;

alter table public.reviews enable row level security;

-- ------------------------------------------------------------------
-- 2. RLS policies
-- ------------------------------------------------------------------
-- Public (anon + authenticated): only approved reviews are visible.
drop policy if exists "reviews_select_approved" on public.reviews;
create policy "reviews_select_approved"
  on public.reviews for select
  using (moderation_status = 'approved');

-- A customer can always read their own reviews (any moderation status).
drop policy if exists "reviews_select_own" on public.reviews;
create policy "reviews_select_own"
  on public.reviews for select
  using (auth.uid() = user_id);

-- Staff read everything (for moderation).
drop policy if exists "reviews_staff_read" on public.reviews;
create policy "reviews_staff_read"
  on public.reviews for select
  using (public.is_staff());

-- Staff may moderate (approve/reject) a review.
drop policy if exists "reviews_staff_update" on public.reviews;
create policy "reviews_staff_update"
  on public.reviews for update
  using (public.is_staff())
  with check (public.is_staff());

-- Only managers may permanently delete a review.
drop policy if exists "reviews_manager_delete" on public.reviews;
create policy "reviews_manager_delete"
  on public.reviews for delete
  using (public.current_user_role() = 'manager');

-- NO direct INSERT policy: inserts go exclusively through submit_review(),
-- which verifies ownership, order status, rating and duplicate prevention.

-- ------------------------------------------------------------------
-- 3. submit_review(): validated, self-owned review submission
-- ------------------------------------------------------------------
create or replace function public.submit_review(
  p_order_id text,
  p_rating   int,
  p_title    text default '',
  p_comment  text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_title   text := btrim(coalesce(p_title, ''));
  v_comment text := btrim(coalesce(p_comment, ''));
  v_status  text;
  v_name    text;
  v_label   text;
  v_id      bigint;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED: please sign in to write a review';
  end if;
  if p_order_id is null or btrim(p_order_id) = '' then
    raise exception 'MISSING_ORDER: select the order you want to review';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_RATING: rating must be between 1 and 5';
  end if;
  if length(v_comment) < 1 then
    raise exception 'EMPTY_COMMENT: please write your review';
  end if;
  if length(v_comment) > 2000 then
    raise exception 'COMMENT_TOO_LONG: please keep your review under 2000 characters';
  end if;
  if length(v_title) > 120 then
    raise exception 'TITLE_TOO_LONG: please keep the title under 120 characters';
  end if;

  -- The order must exist, belong to the caller, and be completed (Delivered).
  select status into v_status
    from public.orders
   where order_id = p_order_id
     and user_id = v_uid;

  if not found then
    raise exception 'ORDER_NOT_FOUND: that order is not on your account';
  end if;
  if v_status <> 'Delivered' then
    raise exception 'ORDER_NOT_COMPLETED: you can review once your order is delivered';
  end if;

  -- Prevent duplicate reviews for the same order.
  if exists (
    select 1 from public.reviews
     where user_id = v_uid and order_id = p_order_id
  ) then
    raise exception 'ALREADY_REVIEWED: you have already reviewed this order';
  end if;

  -- Privacy-safe display label resolved from the reviewer's own profile.
  select nullif(btrim(coalesce(full_name, '')), '') into v_name
    from public.profiles where id = v_uid;
  v_label := coalesce(v_name, nullif(btrim(coalesce(
               (select username from public.profiles where id = v_uid), '')), ''), 'Guest');

  insert into public.reviews (user_id, order_id, rating, title, comment, reviewer_label)
  values (v_uid, p_order_id, p_rating, v_title, v_comment, v_label)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_review(text,int,text,text) from public;
grant execute on function public.submit_review(text,int,text,text) to authenticated;
