-- =============================================================
-- House of Flavours — 008 payments, notifications, editable settings
-- Run after 001, 002, 003, 004 (005 was authored but NOT applied
-- to the production project; this migration is a superset of it,
-- so 008 is safe whether or not 005 was ever run).
-- Idempotent: safe to re-run.
--
-- WHAT THIS DOES
--   * Applies everything 005 intended (orders GST/delivery columns,
--     delivery_zones, settings-driven get_public_settings(), the
--     settings-driven place_order()) — this FIXES the production
--     mismatch where checkout showed FREE delivery / ₹0 GST while
--     the deployed place_order() hardcoded 5% GST + ₹35 delivery.
--   * Adds public.coupons + public.extra_items so discounts and
--     non-menu upsell prices are validated SERVER-SIDE (the client
--     can no longer submit arbitrary discounts or custom prices).
--   * Adds admin_notifications: one row per new order, created by a
--     database trigger (trusted logic, exactly one record per order —
--     multiple admin tabs/devices can never duplicate it).
--   * Adds set_order_payment_status(): staff-only, Pending/Paid/Failed.
--     Payment confirmation can ONLY happen here — never from the
--     customer/browser. Direct UPI QR has no automatic verification.
--   * Adds mark_notification_read() / mark_all_notifications_read()
--     (staff-only). There are no UPDATE policies on
--     admin_notifications, so notifications cannot be forged.
--   * Seeds editable site settings (restaurant info, UPI id, payment
--     methods, opening hours) and exposes the public-safe subset via
--     get_public_settings().
--   * Creates the public 'site-assets' storage bucket + policies so
--     admins can upload the restaurant logo.
--   * Adds public.orders + public.admin_notifications to the
--     supabase_realtime publication so realtime actually fires.
--
-- WHAT THIS DOES NOT DO
--   * Does NOT disable RLS, delete data, drop tables/columns or
--     weaken any existing policy.
--   * Does NOT touch historical orders — existing rows keep their
--     stored totals; new columns default to 0/NULL.
--   * Does NOT expose any secret or service key. get_public_settings()
--     only ever returns an explicit allowlist of public-safe keys.
--
-- IMPORTANT: `p_discount` in place_order() is now IGNORED unless a
-- valid coupon code is supplied in p_coupon_code and re-validated
-- against public.coupons. Deploy the frontend in the same release
-- (the app passes p_coupon_code and tolerates the function being
-- absent during rollout).
-- =============================================================

-- ------------------------------------------------------------------
-- 1. Orders columns (from 005; additive, defaults preserve history).
-- ------------------------------------------------------------------
alter table public.orders
  add column if not exists cgst            numeric(10,2) not null default 0,
  add column if not exists sgst            numeric(10,2) not null default 0,
  add column if not exists igst            numeric(10,2) not null default 0,
  add column if not exists gst_rate        numeric(6,4)  not null default 0,
  add column if not exists delivery_distance_km numeric(7,2),
  add column if not exists delivery_rate_per_km numeric(10,2),
  add column if not exists payment_status  text not null default 'Pending'
    check (payment_status in ('Pending', 'Paid', 'Failed')),
  add column if not exists payment_updated_at timestamptz,
  add column if not exists cancelled_at    timestamptz;

-- ------------------------------------------------------------------
-- 2. Settings seeds (never overwrite existing values).
-- ------------------------------------------------------------------
insert into public.app_settings (key, value) values
  -- pricing / tax (005 defaults)
  ('gst_registered',        'false'),
  ('gst_rate',               '5'),
  ('gst_split',              'cgst_sgst'),
  ('gst_on_delivery',        'false'),
  ('gstin',                  ''),
  ('delivery_mode',          'flat'),
  ('delivery_flat_fee',      '35'),
  ('delivery_free_threshold','499'),
  ('delivery_rate_per_km',   '50'),
  ('delivery_origin_label',  'Ghanapuram'),
  -- editable site settings (008)
  ('restaurant_name',        'House of Flavours'),
  ('restaurant_phone',       '+91 99480 99296'),
  ('restaurant_email',       'bonakurthirahul@gmail.com'),
  ('restaurant_address',     'Ghanapuram'),
  ('restaurant_hours',       'Mon - Sun, 11:00 AM - 11:00 PM'),
  ('restaurant_logo_url',    ''),
  ('upi_id',                 '9948099296@fam'),
  ('payment_methods',        'UPI,COD')
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 3. delivery_zones (owner-defined trusted distance source; 005).
-- ------------------------------------------------------------------
create table if not exists public.delivery_zones (
  id           serial primary key,
  area_label   text not null unique,
  pincode      text,
  distance_km  numeric(7,2) not null check (distance_km >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.delivery_zones enable row level security;

drop trigger if exists trg_delivery_zones_updated_at on public.delivery_zones;
create trigger trg_delivery_zones_updated_at
  before update on public.delivery_zones
  for each row execute function public.set_updated_at();

drop policy if exists "delivery_zones_read_active" on public.delivery_zones;
create policy "delivery_zones_read_active"
  on public.delivery_zones for select
  using (is_active);

drop policy if exists "delivery_zones_staff_insert" on public.delivery_zones;
create policy "delivery_zones_staff_insert"
  on public.delivery_zones for insert
  with check (public.is_staff());

drop policy if exists "delivery_zones_staff_update" on public.delivery_zones;
create policy "delivery_zones_staff_update"
  on public.delivery_zones for update
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "delivery_zones_manager_delete" on public.delivery_zones;
create policy "delivery_zones_manager_delete"
  on public.delivery_zones for delete
  using (public.current_user_role() = 'manager');

-- ------------------------------------------------------------------
-- 4. Coupons (server-side discount validation).
--    Seeds mirror the storefront coupon set; staff may edit/extend.
-- ------------------------------------------------------------------
create table if not exists public.coupons (
  code         text primary key,
  discount     numeric(10,2) not null check (discount > 0),
  discount_type text not null default 'flat' check (discount_type in ('flat', 'percent')),
  min_order    numeric(10,2) not null default 0 check (min_order >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.coupons enable row level security;

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
  before update on public.coupons
  for each row execute function public.set_updated_at();

drop policy if exists "coupons_staff_read" on public.coupons;
create policy "coupons_staff_read"
  on public.coupons for select
  using (public.is_staff());

drop policy if exists "coupons_staff_write" on public.coupons;
create policy "coupons_staff_write"
  on public.coupons for insert
  with check (public.is_staff());

drop policy if exists "coupons_staff_update" on public.coupons;
create policy "coupons_staff_update"
  on public.coupons for update
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "coupons_manager_delete" on public.coupons;
create policy "coupons_manager_delete"
  on public.coupons for delete
  using (public.current_user_role() = 'manager');

insert into public.coupons (code, discount, discount_type, min_order) values
  ('FIRST50',  50, 'flat',    299),
  ('BIRYANI10', 10, 'percent', 399),
  ('RAHUL100', 100, 'flat',    799)
on conflict (code) do nothing;

-- ------------------------------------------------------------------
-- 5. Extra items (server-side whitelist for non-menu upsells).
--    place_order() prices EVERY item from the database; the browser
--    can no longer submit arbitrary names/prices for custom items.
--    Seeds mirror src/data/catalog.js QUICK_UPSELL_ITEMS.
-- ------------------------------------------------------------------
create table if not exists public.extra_items (
  id         text primary key,
  name       text not null unique,
  price      numeric(10,2) not null check (price >= 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.extra_items enable row level security;

drop trigger if exists trg_extra_items_updated_at on public.extra_items;
create trigger trg_extra_items_updated_at
  before update on public.extra_items
  for each row execute function public.set_updated_at();

drop policy if exists "extra_items_staff_read" on public.extra_items;
create policy "extra_items_staff_read"
  on public.extra_items for select
  using (public.is_staff());

drop policy if exists "extra_items_staff_write" on public.extra_items;
create policy "extra_items_staff_write"
  on public.extra_items for insert
  with check (public.is_staff());

drop policy if exists "extra_items_staff_update" on public.extra_items;
create policy "extra_items_staff_update"
  on public.extra_items for update
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "extra_items_manager_delete" on public.extra_items;
create policy "extra_items_manager_delete"
  on public.extra_items for delete
  using (public.current_user_role() = 'manager');

insert into public.extra_items (id, name, price) values
  ('up_salan', 'Extra Mirchi Ka Salan (250ml)',   40),
  ('up_raita', 'Chilled Dahi Boondi Raita',        35),
  ('up_thums', 'Thums Up Charged (250ml Can)',     40)
on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- 6. Admin notifications (new-order alerts for staff).
--    One row per order, written ONLY by the trigger below
--    (SECURITY DEFINER). No INSERT/UPDATE/DELETE policies exist,
--    so customers can neither forge nor alter notifications.
-- ------------------------------------------------------------------
create table if not exists public.admin_notifications (
  id             bigserial primary key,
  order_id       text,
  title          text not null,
  body           text not null default '',
  total          numeric(10,2),
  payment_method text,
  payment_status text not null default 'Pending',
  order_status   text not null default 'Order Received',
  is_read        boolean not null default false,
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

comment on table public.admin_notifications is
  'New-order notifications generated by trg_orders_new_order_notification (trusted DB logic, exactly one row per order).';

alter table public.admin_notifications enable row level security;

create index if not exists admin_notifications_created_at_idx
  on public.admin_notifications (created_at desc);
create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (created_at desc) where not is_read;

drop policy if exists "admin_notifications_staff_read" on public.admin_notifications;
create policy "admin_notifications_staff_read"
  on public.admin_notifications for select
  using (public.is_staff());

-- Trigger: fires once per order INSERT — duplicate-free by design.
create or replace function public.handle_new_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.admin_notifications (
      order_id, title, body, total, payment_method, payment_status, order_status
    ) values (
      new.order_id,
      'New order #' || new.order_id,
      coalesce(new.items_summary, ''),
      new.total,
      new.payment_method,
      coalesce(new.payment_status, 'Pending'),
      coalesce(new.status, 'Order Received')
    );
  exception when others then
    null; -- a notification failure must NEVER block order placement
  end;
  return new;
end;
$$;

drop trigger if exists trg_orders_new_order_notification on public.orders;
create trigger trg_orders_new_order_notification
  after insert on public.orders
  for each row execute function public.handle_new_order_notification();

-- Mark one / all notifications read (staff-only, audited server-side).
create or replace function public.mark_notification_read(p_id bigint, p_read boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;
  update public.admin_notifications
     set is_read = coalesce(p_read, true),
         read_at = case when coalesce(p_read, true) then coalesce(read_at, now()) else null end
   where id = p_id;
  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;
  update public.admin_notifications
     set is_read = true,
         read_at = coalesce(read_at, now())
   where is_read = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ------------------------------------------------------------------
-- 7. Payment status (staff-only). The ONLY path that can mark an
--    order Paid. Direct UPI has no automatic verification: staff
--    confirm against the bank/UPI app before using 'Paid'.
-- ------------------------------------------------------------------
create or replace function public.set_order_payment_status(p_order_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;
  if p_order_id is null or p_status is null then
    raise exception 'MISSING_FIELDS';
  end if;
  if p_status not in ('Pending', 'Paid', 'Failed') then
    raise exception 'INVALID_PAYMENT_STATUS %', p_status;
  end if;
  update public.orders
     set payment_status = p_status,
         payment_updated_at = now(),
         updated_at = now()
   where order_id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- 8. Public settings (explicit allowlist of public-safe keys).
--    NEVER add a secret key here. Values are display-only business
--    information already shown on the public website.
-- ------------------------------------------------------------------
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store_open',               coalesce((select value from public.app_settings where key = 'store_open'), 'true'),
    -- pricing / tax
    'gst_registered',           coalesce((select value from public.app_settings where key = 'gst_registered'), 'false'),
    'gst_rate',                 coalesce((select value from public.app_settings where key = 'gst_rate'), '5'),
    'gst_split',                coalesce((select value from public.app_settings where key = 'gst_split'), 'cgst_sgst'),
    'gst_on_delivery',          coalesce((select value from public.app_settings where key = 'gst_on_delivery'), 'false'),
    'gstin',                    coalesce((select value from public.app_settings where key = 'gstin'), ''),
    'delivery_mode',            coalesce((select value from public.app_settings where key = 'delivery_mode'), 'flat'),
    'delivery_flat_fee',        coalesce((select value from public.app_settings where key = 'delivery_flat_fee'), '35'),
    'delivery_free_threshold',  coalesce((select value from public.app_settings where key = 'delivery_free_threshold'), '499'),
    'delivery_rate_per_km',    coalesce((select value from public.app_settings where key = 'delivery_rate_per_km'), '50'),
    'delivery_origin_label',    coalesce((select value from public.app_settings where key = 'delivery_origin_label'), ''),
    -- editable site info
    'restaurant_name',          coalesce((select value from public.app_settings where key = 'restaurant_name'), 'House of Flavours'),
    'restaurant_phone',         coalesce((select value from public.app_settings where key = 'restaurant_phone'), ''),
    'restaurant_email',         coalesce((select value from public.app_settings where key = 'restaurant_email'), ''),
    'restaurant_address',       coalesce((select value from public.app_settings where key = 'restaurant_address'), ''),
    'restaurant_hours',         coalesce((select value from public.app_settings where key = 'restaurant_hours'), ''),
    'restaurant_logo_url',      coalesce((select value from public.app_settings where key = 'restaurant_logo_url'), ''),
    'upi_id',                   coalesce((select value from public.app_settings where key = 'upi_id'), ''),
    'payment_methods',          coalesce((select value from public.app_settings where key = 'payment_methods'), 'UPI,COD')
  );
$$;

-- ------------------------------------------------------------------
-- 9. set_order_status(): 005 behaviour (status validation +
--    cancelled_at stamp). Same signature as 003.
-- ------------------------------------------------------------------
create or replace function public.set_order_status(p_order_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;
  if p_order_id is null or p_status is null then
    raise exception 'MISSING_FIELDS';
  end if;
  if p_status not in (
    'Order Received', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'
  ) then
    raise exception 'INVALID_STATUS %', p_status;
  end if;

  update public.orders
     set status       = p_status,
         cancelled_at = case when p_status = 'Cancelled' then coalesce(cancelled_at, now()) else null end,
         updated_at   = now()
   where order_id = p_order_id;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- 10. place_order() — settings-driven pricing (fixes the production
--     FREE-delivery/₹0-GST vs hardcoded-5%-GST mismatch) + hardened
--     inputs. Same first 8 parameters; NEW p_coupon_code (default
--     null) so older callers keep resolving during rollout.
--
--     Hardening:
--       * rejects orders while store_open = false
--       * payment method validated against the configured methods
--         (canonical 'UPI'/'COD' stored; legacy labels accepted)
--       * discounts ONLY via a coupon validated against public.coupons
--         (p_discount is ignored — the browser can no longer set it)
--       * non-menu items priced exclusively from public.extra_items
--       * GST/delivery from app_settings (never from the client)
-- ------------------------------------------------------------------
create or replace function public.place_order(
  p_order_id        text,
  p_customer_name   text,
  p_phone           text,
  p_address         text,
  p_instructions    text default '',
  p_payment_method  text default 'Cash on Delivery (COD)',
  p_discount        numeric default 0,
  p_items           jsonb default '[]'::jsonb,
  p_coupon_code     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid             uuid := auth.uid();
  v_username        text;
  v_order_id        text;
  v_subtotal        numeric := 0;
  v_taxable         numeric;
  v_gst             numeric := 0;
  v_cgst            numeric := 0;
  v_sgst            numeric := 0;
  v_igst            numeric := 0;
  v_gst_rate        numeric := 0;
  v_gst_registered  boolean := false;
  v_gst_split       text := 'cgst_sgst';
  v_gst_on_delivery boolean := false;
  v_delivery_mode   text := 'flat';
  v_delivery_flat   numeric := 35;
  v_delivery_free   numeric := 499;
  v_delivery_rate   numeric := 50;
  v_delivery_fee    numeric := 0;
  v_delivery_dist   numeric;
  v_payment_method  text;
  v_discount        numeric := 0;
  v_coupon_code     text;
  v_coup_discount   numeric;
  v_coup_type       text;
  v_coup_min        numeric;
  v_iter            jsonb;
  v_qty             int;
  v_name            text;
  v_price           numeric;
  v_menu_id         text;
  v_summary         text := '';
  v_i               int := 0;
  v_total           numeric;
begin
  -- ---- required fields / cart validation ----
  if p_order_id is null or p_customer_name is null or p_phone is null or p_address is null then
    raise exception 'MISSING_REQUIRED_FIELDS';
  end if;
  if length(btrim(p_customer_name)) < 1 or length(btrim(p_phone)) < 1 or length(btrim(p_address)) < 1 then
    raise exception 'MISSING_REQUIRED_FIELDS';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  -- ---- store must be open (server-enforced, not just the banner) ----
  if coalesce((select value from public.app_settings where key = 'store_open'), 'true') ~* '^(false|0|no|off)$' then
    raise exception 'STORE_CLOSED';
  end if;

  select username into v_username from public.profiles where id = v_uid;

  -- ---- payment method (validated against configuration) ----
  v_payment_method := coalesce(btrim(p_payment_method), '');
  if v_payment_method = '' then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if length(v_payment_method) > 80 then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if v_payment_method ilike 'UPI%' then
    v_payment_method := 'UPI';
  elsif v_payment_method ilike 'COD%' or v_payment_method ilike 'Cash on Delivery%' then
    v_payment_method := 'COD';
  else
    raise exception 'INVALID_PAYMENT_METHOD %', v_payment_method;
  end if;

  -- ---- Pass 1: validate items + compute trusted subtotal/summary ----
  for v_iter in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_iter->>'quantity')::int, 0);
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'INVALID_QUANTITY';
    end if;

    v_menu_id := nullif(v_iter->>'menu_id', 'null');
    if v_menu_id is not null then
      select name, price into v_name, v_price
        from public.menu_items
        where id = v_menu_id and is_available = true;
      if not found then
        raise exception 'ITEM_UNAVAILABLE %', v_menu_id;
      end if;
    else
      -- Non-menu items are priced ONLY from the extra_items whitelist.
      select name, price into v_name, v_price
        from public.extra_items
        where lower(btrim(name)) = lower(btrim(coalesce(v_iter->>'name', '')))
          and is_active = true;
      if not found then
        raise exception 'ITEM_UNAVAILABLE %', coalesce(v_iter->>'name', '');
      end if;
    end if;

    v_subtotal := v_subtotal + (v_price * v_qty);
    v_summary := v_summary
      || case when v_i > 0 then ', ' else '' end
      || v_name || ' (x' || v_qty || ')';
    v_i := v_i + 1;
  end loop;

  if v_subtotal <= 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  -- ---- discount: ONLY a validated coupon code (p_discount ignored) ----
  v_coupon_code := upper(btrim(coalesce(p_coupon_code, '')));
  if v_coupon_code <> '' then
    select discount, discount_type, min_order
      into v_coup_discount, v_coup_type, v_coup_min
      from public.coupons
      where code = v_coupon_code and is_active = true;
    if not found then
      raise exception 'INVALID_COUPON %', v_coupon_code;
    end if;
    if v_subtotal < v_coup_min then
      raise exception 'COUPON_MIN_ORDER %', v_coup_min;
    end if;
    v_discount := case
      when v_coup_type = 'percent' then round(v_subtotal * v_coup_discount / 100, 2)
      else v_coup_discount
    end;
    v_discount := greatest(0, least(v_discount, v_subtotal));
  end if;

  -- ---- trusted configuration (never taken from the client) ----
  v_gst_registered  := coalesce((select (value ~* '^(true|1|yes|on)$') from public.app_settings where key = 'gst_registered'), false);
  v_gst_split       := coalesce((select lower(value) from public.app_settings where key = 'gst_split'), 'cgst_sgst');
  v_gst_on_delivery := coalesce((select (value ~* '^(true|1|yes|on)$') from public.app_settings where key = 'gst_on_delivery'), false);
  v_gst_rate        := coalesce(
                         nullif(regexp_replace(coalesce((select value from public.app_settings where key = 'gst_rate'), ''), '[^0-9.]', '', 'g'), '')::numeric,
                         5);
  if v_gst_rate > 1 then v_gst_rate := v_gst_rate / 100; end if;
  v_gst_rate := greatest(0, least(v_gst_rate, 1));

  v_delivery_mode := coalesce((select lower(value) from public.app_settings where key = 'delivery_mode'), 'flat');
  v_delivery_flat := coalesce(
                       nullif(regexp_replace(coalesce((select value from public.app_settings where key = 'delivery_flat_fee'), ''), '[^0-9.]', '', 'g'), '')::numeric,
                       35);
  v_delivery_free := coalesce(
                       nullif(regexp_replace(coalesce((select value from public.app_settings where key = 'delivery_free_threshold'), ''), '[^0-9.]', '', 'g'), '')::numeric,
                       499);
  v_delivery_rate := coalesce(
                       nullif(regexp_replace(coalesce((select value from public.app_settings where key = 'delivery_rate_per_km'), ''), '[^0-9.]', '', 'g'), '')::numeric,
                       50);

  -- ---- delivery fee (server-verified) ----
  if v_delivery_mode = 'distance' then
    select z.distance_km into v_delivery_dist
      from public.delivery_zones z
      where z.is_active
        and (
          (z.pincode is not null and z.pincode <> '' and p_address ilike '%' || z.pincode || '%')
          or (z.area_label <> '' and p_address ilike '%' || z.area_label || '%')
        )
      order by z.distance_km asc
      limit 1;

    if v_delivery_dist is null then
      raise exception 'DELIVERY_DISTANCE_UNVERIFIED';
    end if;
    v_delivery_fee := greatest(0, round(v_delivery_dist * v_delivery_rate, 2));
  else
    v_delivery_dist := null;
    v_delivery_fee  := case when v_subtotal >= v_delivery_free or v_subtotal = 0 then 0 else v_delivery_flat end;
  end if;

  -- ---- GST (applied only when the business is registered) ----
  if v_gst_registered then
    v_taxable := round(v_subtotal + case when v_gst_on_delivery then v_delivery_fee else 0 end, 2);
    v_gst     := greatest(0, round(v_taxable * v_gst_rate, 2));
    if v_gst_split = 'igst' then
      v_igst := v_gst;
    else
      v_cgst := greatest(0, round(v_gst / 2, 2));
      v_sgst := greatest(0, round(v_gst - v_cgst, 2));
    end if;
  else
    v_taxable := round(v_subtotal, 2);
    v_gst := 0; v_cgst := 0; v_sgst := 0; v_igst := 0;
  end if;

  v_total := greatest(0, round(v_subtotal + v_gst + v_delivery_fee - v_discount, 2));

  -- ---- Pass 2 (parent first): insert order, capture the persisted id ----
  insert into public.orders (
    order_id, user_id, customer_username, customer_name, phone, address,
    instructions, items_summary, subtotal, discount, gst, cgst, sgst, igst, gst_rate,
    delivery_fee, delivery_distance_km, delivery_rate_per_km,
    total, payment_method, payment_status, status
  ) values (
    p_order_id, v_uid, v_username, btrim(p_customer_name), btrim(p_phone), p_address,
    left(coalesce(p_instructions, ''), 500), v_summary, v_subtotal, v_discount, v_gst, v_cgst, v_sgst, v_igst, v_gst_rate,
    v_delivery_fee, v_delivery_dist, case when v_delivery_mode = 'distance' then v_delivery_rate else null end,
    v_total, v_payment_method, 'Pending', 'Order Received'
  )
  returning order_id into v_order_id;

  -- ---- Pass 3 (children): insert line items with the verified prices ----
  for v_iter in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_iter->>'quantity')::int, 0);
    v_menu_id := nullif(v_iter->>'menu_id', 'null');
    if v_menu_id is not null then
      select name, price into v_name, v_price
        from public.menu_items
        where id = v_menu_id and is_available = true;
    else
      select name, price into v_name, v_price
        from public.extra_items
        where lower(btrim(name)) = lower(btrim(coalesce(v_iter->>'name', '')))
          and is_active = true;
    end if;
    insert into public.order_items (order_id, menu_id, name, quantity, price)
    values (v_order_id, v_menu_id, v_name, v_qty, round(v_price, 2));
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'coupon_code', nullif(v_coupon_code, ''),
    'taxable_value', v_taxable,
    'gst', v_gst,
    'cgst', v_cgst,
    'sgst', v_sgst,
    'igst', v_igst,
    'gst_rate', v_gst_rate,
    'gst_registered', v_gst_registered,
    'delivery_fee', v_delivery_fee,
    'delivery_distance_km', v_delivery_dist,
    'delivery_rate_per_km', case when v_delivery_mode = 'distance' then v_delivery_rate else null end,
    'total', v_total,
    'payment_method', v_payment_method,
    'payment_status', 'Pending',
    'status', 'Order Received'
  );
end;
$$;

-- ------------------------------------------------------------------
-- 11. Storage bucket for the restaurant logo (public read, staff
--     write). Created via SQL so no dashboard step is required.
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

drop policy if exists "site_assets_public_read" on storage.objects;
create policy "site_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'site-assets');

drop policy if exists "site_assets_staff_insert" on storage.objects;
create policy "site_assets_staff_insert"
  on storage.objects for insert
  with check (bucket_id = 'site-assets' and public.is_staff());

drop policy if exists "site_assets_staff_update" on storage.objects;
create policy "site_assets_staff_update"
  on storage.objects for update
  using (bucket_id = 'site-assets' and public.is_staff())
  with check (bucket_id = 'site-assets' and public.is_staff());

-- ------------------------------------------------------------------
-- 12. Realtime publication (orders + notifications). Without this,
--     postgres_changes subscriptions silently receive nothing.
--     Idempotent DO-block: skips tables already in the publication.
-- ------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications'
  ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end $$;

-- ------------------------------------------------------------------
-- 13. Privileges
-- ------------------------------------------------------------------
revoke all on function public.place_order(text,text,text,text,text,text,numeric,jsonb,text) from public;
grant execute on function public.place_order(text,text,text,text,text,text,numeric,jsonb,text) to anon, authenticated;

revoke all on function public.set_order_status(text,text) from public;
grant execute on function public.set_order_status(text,text) to authenticated;

revoke all on function public.set_order_payment_status(text,text) from public;
grant execute on function public.set_order_payment_status(text,text) to authenticated;

revoke all on function public.get_public_settings() from public;
grant execute on function public.get_public_settings() to anon, authenticated;

revoke all on function public.mark_notification_read(bigint,boolean) from public;
grant execute on function public.mark_notification_read(bigint,boolean) to authenticated;

revoke all on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;
