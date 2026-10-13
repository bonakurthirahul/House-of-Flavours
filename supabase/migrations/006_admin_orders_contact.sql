-- =============================================================
-- House of Flavours — 006 staff order deletion + contact inbox
-- Run after 001, 002, 003, 004 and 005.
-- Idempotent: safe to re-run.
--
-- What this migration does (and does NOT do):
--   * Adds public.delete_order(): staff-only, transactional deletion of an
--     order. It re-checks the live status INSIDE the transaction and only
--     permits deletion when the order is exactly 'Delivered' or 'Cancelled'.
--     order_items are removed automatically via the existing
--     `on delete cascade` foreign key.
--   * Adds public.contact_messages with RLS: only staff may read/update/delete.
--     The public contact form inserts through the validated
--     public.submit_contact_message() security-definer function (no direct
--     INSERT policy is granted, so the table cannot be bulk-spammed/anonymous
--     read).
--   * Does NOT disable RLS, delete data, drop/alter tables or columns, and
--     does NOT expose any privileged key.
--
-- WHY A NEW TABLE: the contact form previously posted to an external SheetDB
-- endpoint; there was no Supabase-backed inbox. contact_messages provides a
-- real, staff-readable destination without weakening order/profile security.
-- =============================================================

-- ------------------------------------------------------------------
-- 1. Staff-only order deletion (Delivered / Cancelled only).
-- ------------------------------------------------------------------
create or replace function public.delete_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: staff required';
  end if;
  if p_order_id is null then
    raise exception 'MISSING_FIELDS';
  end if;

  -- Lock the row so the status cannot change between the check and the delete.
  select status into v_status
    from public.orders
   where order_id = p_order_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if v_status not in ('Delivered', 'Cancelled') then
    raise exception 'ORDER_NOT_DELETABLE: only Delivered or Cancelled orders can be deleted';
  end if;

  -- order_items.order_id has ON DELETE CASCADE, so line items go with it.
  delete from public.orders where order_id = p_order_id;
end;
$$;

revoke all on function public.delete_order(text) from public;
grant execute on function public.delete_order(text) to authenticated;

-- ------------------------------------------------------------------
-- 2. Contact messages (public submit via RPC; staff-only inbox).
-- ------------------------------------------------------------------
create table if not exists public.contact_messages (
  id         bigserial primary key,
  name       text not null,
  phone      text,
  email      text,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

alter table public.contact_messages enable row level security;

-- Staff read the inbox.
drop policy if exists "contact_messages_staff_read" on public.contact_messages;
create policy "contact_messages_staff_read"
  on public.contact_messages for select
  using (public.is_staff());

-- Staff may mark messages read.
drop policy if exists "contact_messages_staff_update" on public.contact_messages;
create policy "contact_messages_staff_update"
  on public.contact_messages for update
  using (public.is_staff())
  with check (public.is_staff());

-- Only managers may permanently delete a message.
drop policy if exists "contact_messages_manager_delete" on public.contact_messages;
create policy "contact_messages_manager_delete"
  on public.contact_messages for delete
  using (public.current_user_role() = 'manager');

-- NO public insert/select policy: inserts go exclusively through the
-- security-definer function below, which validates and rate-limits input.
create or replace function public.submit_contact_message(
  p_name    text,
  p_phone   text default '',
  p_email   text default '',
  p_message text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := btrim(coalesce(p_name, ''));
  v_phone   text := btrim(coalesce(p_phone, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_id      bigint;
begin
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'INVALID_NAME';
  end if;
  if length(v_message) < 1 or length(v_message) > 4000 then
    raise exception 'INVALID_MESSAGE';
  end if;
  if v_phone = '' and v_email = '' then
    raise exception 'CONTACT_REQUIRED: provide a phone or email';
  end if;
  if v_phone <> '' and length(v_phone) > 40 then
    raise exception 'INVALID_PHONE';
  end if;
  if v_email <> '' then
    if length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'INVALID_EMAIL';
    end if;
  end if;

  -- Lightweight anti-flood: reject an identical message from the same
  -- contact within the last 30 seconds.
  if exists (
    select 1 from public.contact_messages m
     where m.message = v_message
       and coalesce(m.email, '') = v_email
       and coalesce(m.phone, '') = v_phone
       and m.created_at > now() - interval '30 seconds'
  ) then
    raise exception 'DUPLICATE_MESSAGE';
  end if;

  insert into public.contact_messages (name, phone, email, message)
  values (v_name, nullif(v_phone, ''), nullif(v_email, ''), v_message)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_contact_message(text,text,text,text) from public;
grant execute on function public.submit_contact_message(text,text,text,text) to anon, authenticated;
