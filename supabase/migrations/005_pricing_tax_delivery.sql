-- =============================================================
-- House of Flavours — 005 configurable GST + Ghanapur distance delivery
-- Run after 001, 002, 003 and 004.
-- Idempotent: safe to re-run.
--
-- WHAT THIS DOES
--   * Seeds configurable GST + delivery settings in public.app_settings.
--   * Adds order columns for the GST split, applied rate, verified delivery
--     distance/rate and cancellation timestamp (ADD COLUMN IF NOT EXISTS —
--     non-destructive; existing orders/rows are never touched or deleted).
--   * Adds public.delivery_zones (owner-defined, trusted road-distance source)
--     with RLS: public may read active zones; only staff may write.
--   * Extends public.get_public_settings() so the storefront can display the
--     exact same configuration the server enforces.
--   * Re-creates public.set_order_status() to stamp cancelled_at.
--   * Re-creates public.place_order() with the SAME 8-argument signature,
--     preserving the migration-004 parent-before-child insert + RETURNING fix,
--     and adds server-side GST + delivery calculation.
--
-- TAX / DELIVERY DEFAULTS (require owner confirmation before they take effect):
--   gst_registered = 'false'  -> NO GST is collected until the owner confirms
--                                registration and place-of-supply treatment.
--   gst_rate       = '0.05'   -> 5% prepared but only applied when registered.
--   delivery_mode  = 'flat'   -> distance pricing stays OFF until the exact
--                                Ghanapur origin + a trusted distance source
--                                (delivery_zones rows or a routing integration)
--                                are configured.
--
-- This migration does NOT disable RLS, does NOT expose service-role keys and
-- does NOT grant customers any broad order-update access.
-- =============================================================

-- ------------------------------------------------------------------
-- 1. Configurable settings (single source of truth for tax + delivery).
--    Defaults preserve the previous behaviour unless explicitly enabled.
-- ------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('gst_registered',        'false'),
  ('gst_rate',              '0.05'),
  ('gst_split',             'cgst_sgst'),
  ('gst_on_delivery',       'false'),
  ('gstin',                 ''),
  ('delivery_mode',         'flat'),
  ('delivery_flat_fee',     '35'),
  ('delivery_free_threshold','499'),
  ('delivery_rate_per_km',  '50'),
  ('delivery_origin_label', 'Ghanapuram'),
  -- Confirmed origin coordinates. Server-side only (NOT exposed by
  -- get_public_settings); used for road-distance verification once a routing
  -- provider is configured. Google Maps reference:
  --   https://www.google.com/maps?q=17.429889,78.687861
  ('delivery_origin_lat',   '17.429889'),
  ('delivery_origin_lng',   '78.687861')
on conflict (key) do nothing;

-- ------------------------------------------------------------------
-- 2. Order columns (purely additive).
-- ------------------------------------------------------------------
alter table public.orders
  add column if not exists cgst            numeric(10,2) not null default 0,
  add column if not exists sgst            numeric(10,2) not null default 0,
  add column if not exists igst            numeric(10,2) not null default 0,
  add column if not exists gst_rate        numeric(6,4)  not null default 0,
  add column if not exists delivery_distance_km numeric(7,2),
  add column if not exists delivery_rate_per_km numeric(10,2),
  add column if not exists payment_status  text not null default 'Pending',
  add column if not exists cancelled_at    timestamptz;

-- ------------------------------------------------------------------
-- 3. Owner-defined delivery zones (trusted road-distance source).
--    Seed rows are intentionally NOT inserted: distances must be verified
--    by the owner (e.g. against a maps provider) before they are trusted.
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
-- 4. Public settings (storefront display must match what the server enforces).
-- ------------------------------------------------------------------
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store_open',              coalesce((select value from public.app_settings where key = 'store_open'), 'true'),
    'gst_registered',          coalesce((select value from public.app_settings where key = 'gst_registered'), 'false'),
    'gst_rate',                coalesce((select value from public.app_settings where key = 'gst_rate'), '0.05'),
    'gst_split',               coalesce((select value from public.app_settings where key = 'gst_split'), 'cgst_sgst'),
    'gst_on_delivery',         coalesce((select value from public.app_settings where key = 'gst_on_delivery'), 'false'),
    'gstin',                   coalesce((select value from public.app_settings where key = 'gstin'), ''),
    'delivery_mode',           coalesce((select value from public.app_settings where key = 'delivery_mode'), 'flat'),
    'delivery_flat_fee',       coalesce((select value from public.app_settings where key = 'delivery_flat_fee'), '35'),
    'delivery_free_threshold', coalesce((select value from public.app_settings where key = 'delivery_free_threshold'), '499'),
    'delivery_rate_per_km',    coalesce((select value from public.app_settings where key = 'delivery_rate_per_km'), '50'),
    'delivery_origin_label',   coalesce((select value from public.app_settings where key = 'delivery_origin_label'), '')
  );
$$;

-- ------------------------------------------------------------------
-- 5. set_order_status(): stamp/clear cancelled_at (same signature as 003).
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
-- 6. place_order(): SAME 8-arg signature. Parent-first insert from 004 is
--    preserved; adds trusted GST + delivery calculation read from settings.
-- ------------------------------------------------------------------
create or replace function public.place_order(
  p_order_id        text,
  p_customer_name   text,
  p_phone           text,
  p_address         text,
  p_instructions    text default '',
  p_payment_method  text default 'Cash on Delivery (COD)',
  p_discount        numeric default 0,
  p_items           jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_username       text;
  v_order_id       text;                 -- id actually written to public.orders
  v_subtotal       numeric := 0;
  v_taxable        numeric;
  v_gst            numeric := 0;
  v_cgst           numeric := 0;
  v_sgst           numeric := 0;
  v_igst           numeric := 0;
  v_gst_rate       numeric := 0;
  v_gst_registered boolean := false;
  v_gst_split      text := 'cgst_sgst';
  v_gst_on_delivery boolean := false;
  v_delivery_mode  text := 'flat';
  v_delivery_flat  numeric := 35;
  v_delivery_free  numeric := 499;
  v_delivery_rate  numeric := 50;
  v_delivery_fee   numeric := 0;
  v_delivery_dist  numeric;
  v_iter           jsonb;
  v_qty            int;
  v_name           text;
  v_price          numeric;
  v_menu_id        text;
  v_summary        text := '';
  v_i              int := 0;
  v_total          numeric;
begin
  -- ---- required fields / cart validation ----
  if p_order_id is null or p_customer_name is null or p_phone is null or p_address is null then
    raise exception 'MISSING_REQUIRED_FIELDS';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  select username into v_username from public.profiles where id = v_uid;

  -- ---- Pass 1: validate items + compute trusted subtotal/summary ----
  for v_iter in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_iter->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_menu_id := nullif(v_iter->>'menu_id', 'null');
    if v_menu_id is not null then
      select name, price into v_name, v_price
        from public.menu_items
        where id = v_menu_id and is_available = true;
      if not found then
        raise exception 'ITEM_UNAVAILABLE %', v_menu_id;
      end if;
    else
      v_name  := coalesce(nullif(v_iter->>'name', ''), 'Item');
      v_price := greatest(0, coalesce((v_iter->>'price')::numeric, 0));
    end if;

    v_subtotal := v_subtotal + (v_price * v_qty);
    v_summary := v_summary
      || case when v_i > 0 then ', ' else '' end
      || v_name || ' (x' || v_qty || ')';
    v_i := v_i + 1;
  end loop;

  -- ---- Trusted configuration (never taken from the client) ----
  v_gst_registered  := coalesce((select (value ~* '^(true|1|yes|on)$') from public.app_settings where key = 'gst_registered'), false);
  v_gst_split       := coalesce((select lower(value) from public.app_settings where key = 'gst_split'), 'cgst_sgst');
  v_gst_on_delivery := coalesce((select (value ~* '^(true|1|yes|on)$') from public.app_settings where key = 'gst_on_delivery'), false);
  v_gst_rate        := coalesce(
                         nullif(regexp_replace(coalesce((select value from public.app_settings where key = 'gst_rate'), ''), '[^0-9.]', '', 'g'), '')::numeric,
                         0.05);
  if v_gst_rate > 1 then v_gst_rate := v_gst_rate / 100; end if;

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

  -- ---- Delivery fee (server-verified) ----
  if v_delivery_mode = 'distance' then
    -- Distance comes ONLY from owner-defined zones (trusted), never the client.
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

  p_discount := greatest(0, least(coalesce(p_discount, 0), v_subtotal));

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

  v_total := greatest(0, round(v_subtotal + v_gst + v_delivery_fee - p_discount, 2));

  -- ---- Pass 2 (parent first): insert order, capture the persisted id ----
  insert into public.orders (
    order_id, user_id, customer_username, customer_name, phone, address,
    instructions, items_summary, subtotal, discount, gst, cgst, sgst, igst, gst_rate,
    delivery_fee, delivery_distance_km, delivery_rate_per_km,
    total, payment_method, payment_status, status
  ) values (
    p_order_id, v_uid, v_username, p_customer_name, p_phone, p_address,
    coalesce(p_instructions, ''), v_summary, v_subtotal, p_discount, v_gst, v_cgst, v_sgst, v_igst, v_gst_rate,
    v_delivery_fee, v_delivery_dist, case when v_delivery_mode = 'distance' then v_delivery_rate else null end,
    v_total, coalesce(p_payment_method, 'Cash on Delivery (COD)'), 'Pending', 'Order Received'
  )
  returning order_id into v_order_id;

  -- ---- Pass 3 (children): insert items using the verified parent id ----
  for v_iter in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_iter->>'quantity')::int, 0);
    v_menu_id := nullif(v_iter->>'menu_id', 'null');
    if v_menu_id is not null then
      select name, price into v_name, v_price
        from public.menu_items
        where id = v_menu_id and is_available = true;
    else
      v_name  := coalesce(nullif(v_iter->>'name', ''), 'Item');
      v_price := greatest(0, coalesce((v_iter->>'price')::numeric, 0));
    end if;
    insert into public.order_items (order_id, menu_id, name, quantity, price)
    values (v_order_id, v_menu_id, v_name, v_qty, round(v_price, 2));
  end loop;

  return jsonb_build_object(
    'order_id', v_order_id,
    'subtotal', v_subtotal,
    'discount', p_discount,
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
    'payment_status', 'Pending',
    'status', 'Order Received'
  );
end;
$$;

-- ------------------------------------------------------------------
-- 7. Privileges (unchanged model: no direct order writes for customers).
-- ------------------------------------------------------------------
revoke all on function public.place_order(text,text,text,text,text,text,numeric,jsonb) from public;
grant execute on function public.place_order(text,text,text,text,text,text,numeric,jsonb) to anon, authenticated;

revoke all on function public.set_order_status(text,text) from public;
grant execute on function public.set_order_status(text,text) to authenticated;

revoke all on function public.get_public_settings() from public;
grant execute on function public.get_public_settings() to anon, authenticated;
