-- =============================================================
-- House of Flavours — 004 fix place_order() order_items FK violation
-- Run after 001, 002 and 003.
-- Idempotent: safe to re-run.
--
-- ROOT CAUSE
--   The deployed public.place_order() inserted each line into
--   public.order_items *inside the pricing loop*, i.e. BEFORE the parent
--   row existed in public.orders. PostgreSQL therefore raised:
--
--     insert or update on table "order_items" violates foreign key
--     constraint "order_items_order_id_fkey"
--     Key (order_id)=(...) is not present in table "orders".
--
-- FIX
--   * Insert the parent row into public.orders FIRST.
--   * Capture the id actually written with `RETURNING order_id`.
--   * Insert every order_items row with that exact captured id.
--   * The whole function runs in a single transaction, so any failure
--     (invalid quantity, unavailable item, FK, etc.) rolls back the
--     parent order too — no partial orders are ever left behind.
--
-- SAFETY
--   * Only re-creates the existing function. Same name, same parameter
--     types, same defaults, same SECURITY DEFINER mode and search_path.
--   * Does NOT create/alter/drop tables, columns or RLS policies.
--   * Does NOT delete data, hardcode ids, or expose privileged keys.
--   * Preserves server-side pricing, discounts, GST, delivery fee,
--     items_summary, menu availability validation and the jsonb return.
-- =============================================================

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
  v_order_id text;                 -- id actually written to public.orders
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

  -- Pass 1: validate items and compute trusted totals/summary.
  -- (No order_items writes happen here anymore.)
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

  v_gst      := round(v_subtotal * 0.05, 2);
  v_delivery := case when v_subtotal >= 499 or v_subtotal = 0 then 0 else 35 end;
  p_discount := greatest(0, least(coalesce(p_discount, 0), v_subtotal));
  v_total    := greatest(0, v_subtotal + v_gst + v_delivery - p_discount);

  -- Pass 2 (parent first): insert the order and capture the id that was
  -- actually persisted. `returning` means we never guess/mis-map the id.
  insert into public.orders (
    order_id, user_id, customer_username, customer_name, phone, address,
    instructions, items_summary, subtotal, discount, gst, delivery_fee,
    total, payment_method, status
  ) values (
    p_order_id, v_uid, v_username, p_customer_name, p_phone, p_address,
    coalesce(p_instructions, ''), v_summary, v_subtotal, p_discount, v_gst,
    v_delivery, v_total, coalesce(p_payment_method, 'Cash on Delivery (COD)'),
    'Order Received'
  )
  returning order_id into v_order_id;

  -- Pass 3 (children): insert line items using the verified parent id.
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
    'gst', v_gst,
    'delivery_fee', v_delivery,
    'total', v_total,
    'status', 'Order Received'
  );
end;
$$;

-- ------------------------------------------------------------------
-- Privileges: re-assert the exact same model as 001.
--   * No direct table writes are granted to anon/authenticated.
--   * Only this SECURITY DEFINER function (which runs as its owner and
--     therefore bypasses RLS safely) may create orders + items.
-- ------------------------------------------------------------------
revoke all on function public.place_order(text,text,text,text,text,text,numeric,jsonb) from public;
grant execute on function public.place_order(text,text,text,text,text,text,numeric,jsonb) to anon, authenticated;
