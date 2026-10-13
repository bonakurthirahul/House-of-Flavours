-- =============================================================
-- House of Flavours — 003 admin dashboard support
-- Run after 001 and 002.
-- Idempotent: safe to re-run.
--
-- What this migration does (and does NOT do):
--   * ADDS staff-only INSERT/UPDATE/DELETE policies so the dashboard can
--     manage menu items and categories. It never weakens the existing public
--     read policies or the customer order policies.
--   * Adds an `app_settings` table (key/value) with staff read + staff write.
--   * Adds a staff-only stats function for the overview cards.
--   * Re-creates set_order_status() with status-value validation (same
--     signature; existing grants are preserved).
--   * Does NOT drop tables, delete data, or change column types.
--   * Does NOT create staff accounts. See ADMIN.md for secure provisioning.
--
-- Authorization is enforced by public.is_staff() / public.current_user_role(),
-- both SECURITY DEFINER with a fixed search_path. Frontend code is never the
-- security boundary.
-- =============================================================

-- ------------------------------------------------------------------
-- menu_items: staff-only writes (previously there were NO write policies,
-- so the Menu Editor could not save while RLS was enabled).
-- ------------------------------------------------------------------
drop policy if exists "menu_staff_insert" on public.menu_items;
create policy "menu_staff_insert"
  on public.menu_items for insert
  with check (public.is_staff());

drop policy if exists "menu_staff_update" on public.menu_items;
create policy "menu_staff_update"
  on public.menu_items for update
  using (public.is_staff())
  with check (public.is_staff());

-- Hard deletes are restricted to managers. The dashboard uses soft
-- (de)activation by default so historical order_items are never orphaned.
drop policy if exists "menu_manager_delete" on public.menu_items;
create policy "menu_manager_delete"
  on public.menu_items for delete
  using (public.current_user_role() = 'manager');

-- ------------------------------------------------------------------
-- categories: public read already exists; add staff-only writes.
-- ------------------------------------------------------------------
drop policy if exists "categories_staff_insert" on public.categories;
create policy "categories_staff_insert"
  on public.categories for insert
  with check (public.is_staff());

drop policy if exists "categories_staff_update" on public.categories;
create policy "categories_staff_update"
  on public.categories for update
  using (public.is_staff())
  with check (public.is_staff());

-- Categories are referenced by menu_items(category) with ON UPDATE CASCADE and
-- no cascade delete, so deleting a category that still has items fails. Only
-- managers may attempt it.
drop policy if exists "categories_manager_delete" on public.categories;
create policy "categories_manager_delete"
  on public.categories for delete
  using (public.current_user_role() = 'manager');

-- ------------------------------------------------------------------
-- app_settings: single source of truth for simple operational settings.
-- ------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.app_settings enable row level security;

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Staff can read all settings; nobody else can read the table directly.
drop policy if exists "settings_staff_read" on public.app_settings;
create policy "settings_staff_read"
  on public.app_settings for select
  using (public.is_staff());

-- Seed the store-open flag (does not overwrite an existing value).
insert into public.app_settings (key, value)
values ('store_open', 'true')
on conflict (key) do nothing;

-- Public, minimal exposure: the storefront may read ONLY these keys.
create or replace function public.get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store_open',
    coalesce((select value from public.app_settings where key = 'store_open'), 'true')
  );
$$;

-- Staff-only write path (keeps writes explicit and auditable).
create or replace function public.admin_set_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'INVALID_SETTING_KEY';
  end if;
  insert into public.app_settings (key, value, updated_by)
  values (trim(p_key), coalesce(p_value, ''), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_by = auth.uid(),
        updated_at = now();
end;
$$;

-- ------------------------------------------------------------------
-- admin_order_stats(): staff-only aggregate for the Overview cards.
--
-- Revenue semantics (documented): revenue counts the `total` of orders that
-- are NOT cancelled, i.e. order statuses other than 'Cancelled'. Unpaid COD
-- orders are only truly settled when delivered, so we also expose
-- delivered_revenue for a settled figure.
-- ------------------------------------------------------------------
create or replace function public.admin_order_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_orders',      count(*),
    'pending_orders',    count(*) filter (where status in ('Order Received', 'Preparing', 'Out for Delivery')),
    'completed_orders',  count(*) filter (where status = 'Delivered'),
    'cancelled_orders',  count(*) filter (where status = 'Cancelled'),
    'revenue',           coalesce(sum(total) filter (where status <> 'Cancelled'), 0),
    'delivered_revenue', coalesce(sum(total) filter (where status = 'Delivered'), 0)
  )
  from public.orders
  where public.is_staff();
$$;

-- ------------------------------------------------------------------
-- set_order_status(): re-create with status-value validation.
-- Same signature as 001; preserves the existing NOT_AUTHORIZED behaviour.
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
     set status = p_status,
         updated_at = now()
   where order_id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------
revoke all on function public.get_public_settings() from public;
revoke all on function public.admin_set_setting(text, text) from public;
revoke all on function public.admin_order_stats() from public;

grant execute on function public.get_public_settings() to anon, authenticated;
grant execute on function public.admin_set_setting(text, text) to authenticated;
grant execute on function public.admin_order_stats() to authenticated;
grant execute on function public.set_order_status(text, text) to authenticated;
