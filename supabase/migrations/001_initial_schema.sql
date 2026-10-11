-- =============================================================
-- House of Flavours — Supabase schema, functions, triggers & RLS
-- Run this whole file once in: Dashboard > SQL Editor > New query
-- (or: supabase db push)
-- Idempotent: safe to re-run.
-- =============================================================

create extension if not exists "moddatetime";

-- ------------------------------------------------------------------
-- Shared updated_at trigger function
-- ------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------------
-- profiles
-- ------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  email      text,
  phone      text,
  full_name  text,
  role       text not null default 'customer' check (role = 'customer'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.role is
  'Role is forced to customer by trigger. Staff are managed in public.staff_roles only.';

alter table public.profiles enable row level security;

-- Auto-create a profile whenever an auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email, full_name, phone)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), new.id::text),
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep role exactly 'customer'; users cannot persist any other value.
create or replace function public.profiles_force_customer_role()
returns trigger
language plpgsql
as $$
begin
  new.role := 'customer';
  return new;
end;
$$;

drop trigger if exists trg_profiles_force_customer_role on public.profiles;
create trigger trg_profiles_force_customer_role
  before insert or update on public.profiles
  for each row execute function public.profiles_force_customer_role();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS: own row only.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ------------------------------------------------------------------
-- staff_roles (NO direct access — reached only via security definer)
-- ------------------------------------------------------------------
create table if not exists public.staff_roles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         text not null check (role in ('staff', 'manager')),
  display_name text,
  granted_at   timestamptz not null default now()
);

alter table public.staff_roles enable row level security;
-- Intentionally NO policies -> only security-definer functions can read/write.

-- ------------------------------------------------------------------
-- Role helpers (security definer -> trusted DB lookup, not client data)
-- public.is_staff()        -> whether the current user has a staff_roles row
-- public.current_user_role() -> 'manager' | 'staff' | 'customer'
-- (MUST come after staff_roles so the SQL bodies can be created.)
-- ------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_roles sr
    where sr.user_id = auth.uid()
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.staff_roles where user_id = auth.uid()),
    'customer'
  );
$$;

-- ------------------------------------------------------------------
-- categories
-- ------------------------------------------------------------------
create table if not exists public.categories (
  id          serial primary key,
  name        text not null unique,
  description text not null default '',
  sort_order  int  not null default 0
);

alter table public.categories enable row level security;

create policy "categories_read_public"
  on public.categories for select
  using (true);

-- ------------------------------------------------------------------
-- menu_items
-- ------------------------------------------------------------------
create table if not exists public.menu_items (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  price        numeric(10,2) not null check (price >= 0),
  image        text,
  category     text not null references public.categories (name) on update cascade,
  is_veg       boolean not null default true,
  is_available boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id)
);

alter table public.menu_items enable row level security;

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

create policy "menu_read_public"
  on public.menu_items for select
  using (true);

-- ------------------------------------------------------------------
-- orders
-- ------------------------------------------------------------------
create table if not exists public.orders (
  order_id          text primary key,
  user_id           uuid references auth.users (id) on delete set null,
  customer_username text,
  customer_name     text not null,
  phone             text not null,
  address           text not null,
  instructions      text not null default '',
  items_summary     text not null default '',
  subtotal          numeric(10,2) not null default 0,
  discount          numeric(10,2) not null default 0,
  gst               numeric(10,2) not null default 0,
  delivery_fee      numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  payment_method    text not null default 'Cash on Delivery (COD)',
  status            text not null default 'Order Received',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.orders enable row level security;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Customers see their own orders (authenticated only). Staff see all.
create policy "orders_select_own_or_staff"
  on public.orders for select
  using (
    (auth.uid() is not null and auth.uid() = user_id)
    or public.is_staff()
  );

-- Direct writes (outside the security-definer place_order) are not allowed:
-- only the place_order() and set_order_status() functions may modify orders.

-- ------------------------------------------------------------------
-- order_items
-- ------------------------------------------------------------------
create table if not exists public.order_items (
  id       serial primary key,
  order_id text not null references public.orders (order_id) on delete cascade,
  menu_id  text references public.menu_items (id),
  name     text not null,
  quantity int not null check (quantity > 0),
  price    numeric(10,2) not null check (price >= 0)
);

alter table public.order_items enable row level security;

-- Customers read line items only through their own orders.
create policy "order_items_select_own_or_staff"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.order_id = order_items.order_id
        and ((auth.uid() is not null and auth.uid() = o.user_id) or public.is_staff())
    )
  );

-- ------------------------------------------------------------------
-- place_order(): transactional order creation with server-side pricing.
--   p_items = [{menu_id, quantity} | {name, price, quantity}]
-- (defaults to '[]'; an empty or null items payload raises EMPTY_ORDER)
-- Any menu_id is priced from menu_items (trusted); non-menu upsells use the
-- supplied price, clamped to >= 0. Totals are recomputed here — never trusted
-- from the browser.
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
  v_uid      uuid := auth.uid();
  v_username text;
  v_subtotal numeric := 0;
  v_gst      numeric;
  v_delivery numeric;
  v_total    numeric;
  v_iter     jsonb;
  v_qty      int;
  v_name     text;
  v_price    numeric;
  v_menu_id  text;
  v_summary  text := '';
  v_i        int := 0;
begin
  if p_order_id is null or p_customer_name is null or p_phone is null or p_address is null then
    raise exception 'MISSING_REQUIRED_FIELDS';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_ORDER';
  end if;

  select username into v_username from public.profiles where id = v_uid;

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

    insert into public.order_items (order_id, menu_id, name, quantity, price)
    values (p_order_id, v_menu_id, v_name, v_qty, round(v_price, 2));
  end loop;

  v_gst      := round(v_subtotal * 0.05, 2);
  v_delivery := case when v_subtotal >= 499 or v_subtotal = 0 then 0 else 35 end;
  p_discount := greatest(0, least(coalesce(p_discount, 0), v_subtotal));
  v_total    := greatest(0, v_subtotal + v_gst + v_delivery - p_discount);

  insert into public.orders (
    order_id, user_id, customer_username, customer_name, phone, address,
    instructions, items_summary, subtotal, discount, gst, delivery_fee,
    total, payment_method, status
  ) values (
    p_order_id, v_uid, v_username, p_customer_name, p_phone, p_address,
    coalesce(p_instructions, ''), v_summary, v_subtotal, p_discount, v_gst,
    v_delivery, v_total, coalesce(p_payment_method, 'Cash on Delivery (COD)'),
    'Order Received'
  );

  return jsonb_build_object(
    'order_id', p_order_id,
    'subtotal', v_subtotal,
    'discount', p_discount,
    'gst', v_gst,
    'delivery_fee', v_delivery,
    'total', v_total,
    'status', 'Order Received'
  );
end;
$$;

-- ------------------------------------------------------------------
-- set_order_status(): staff-only status updates.
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
  update public.orders
     set status = p_status,
         updated_at = now()
   where order_id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- sync_catalog(): staff-only bulk sync of categories + menu items.
-- Used by the Kitchen dashboard ("Sync to database") and first seed.
-- ------------------------------------------------------------------
create or replace function public.sync_catalog(p_categories jsonb, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_cat  record;
  v_item record;
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;

  if p_categories is not null then
    for v_cat in select *
      from jsonb_to_recordset(p_categories)
      as x(name text, description text, sort_order int)
    loop
      if v_cat.name is not null then
        insert into public.categories (name, description, sort_order)
        values (v_cat.name, coalesce(v_cat.description, ''), coalesce(v_cat.sort_order, 0))
        on conflict (name)
        do update set description = excluded.description, sort_order = excluded.sort_order;
      end if;
    end loop;
  end if;

  if p_items is not null then
    for v_item in select *
      from jsonb_to_recordset(p_items)
      as x(
        id text, name text, description text, price numeric, image text,
        category text, is_veg boolean, is_available boolean, sort_order int
      )
    loop
      if v_item.id is null or v_item.name is null or v_item.category is null then
        continue;
      end if;
      insert into public.menu_items (
        id, name, description, price, image, category, is_veg, is_available,
        sort_order, updated_by
      ) values (
        v_item.id, v_item.name, coalesce(v_item.description, ''),
        coalesce(v_item.price, 0), v_item.image, v_item.category,
        coalesce(v_item.is_veg, true), coalesce(v_item.is_available, true),
        coalesce(v_item.sort_order, 0), v_uid
      )
      on conflict (id) do update set
        name         = excluded.name,
        description  = excluded.description,
        price        = excluded.price,
        image        = excluded.image,
        category     = excluded.category,
        is_veg       = excluded.is_veg,
        is_available = excluded.is_available,
        sort_order   = excluded.sort_order,
        updated_by   = v_uid,
        updated_at   = now();
    end loop;
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- Grants (publishable key paths)
-- ------------------------------------------------------------------
revoke all on function public.place_order(text,text,text,text,text,text,numeric,jsonb) from public;
revoke all on function public.set_order_status(text,text) from public;
revoke all on function public.sync_catalog(jsonb,jsonb) from public;

grant execute on function public.place_order(text,text,text,text,text,text,numeric,jsonb) to anon, authenticated;
grant execute on function public.set_order_status(text,text) to authenticated;
grant execute on function public.sync_catalog(jsonb,jsonb) to authenticated;
grant execute on function public.current_user_role() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;