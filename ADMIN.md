# House of Flavours — Admin Guide

Secure staff login and restaurant management dashboard for House of Flavours.

- **Admin URL:** `/admin` (login at `/admin/login`)
- **Stack:** React 19 + Vite + Tailwind v4 + Supabase Auth / Postgres (RLS)
- The admin bundle is **code-split** — storefront visitors never download it.

---

## 1. Security model (read this first)

- **Passwords** are handled entirely by **Supabase Auth** (hashed server-side).
  No password is ever stored in or read from the browser.
- **Roles** come from trusted database records (`public.staff_roles`, via the
  `current_user_role()` security-definer function) — **never** from localStorage
  or any client state.
- **The database is the security boundary.** The `/admin` route guard is UX only;
  every read/write is authorized by Postgres RLS policies and by
  `is_staff()` / `current_user_role()` checks inside SECURITY DEFINER functions.
- Users sign in with a **username**. Internally each account is a Supabase email
  account using the deterministic convention `username@hof.in`
  (see `HOF_EMAIL_DOMAIN` in `src/lib/authService.js`). A full email also works.
- The legacy hardcoded staff credential, the SheetDB login, and the client-only
  "kitchen dashboard" have been **removed**.

> Never put the Supabase **service-role / secret** key in the frontend or in
> `VITE_*` variables. Only the publishable/anon key belongs in the browser.

---

## 2. Environment

Copy `.env.example` → `.env` and set:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
```

`VITE_SUPABASE_ANON_KEY` is also accepted as a fallback name.
The site runs read-only (menu + order placement falls back to the legacy path)
when these are missing; the admin area shows an explicit "unavailable" notice.

---

## 3. Database migrations

Run these **in order** in the Supabase SQL editor (or via the CLI):

| File | Purpose |
| --- | --- |
| `supabase/migrations/001_initial_schema.sql` | Tables, RLS, base functions |
| `supabase/migrations/002_seed_categories_and_menu.sql` | 6 categories, 57 menu items |
| `supabase/migrations/003_admin_dashboard.sql` | **Admin dashboard support** |

### What `003` adds
- Staff-only `INSERT`/`UPDATE` policies on `menu_items` and `categories`
  (previously **missing**, so the Menu Editor could not save under RLS).
- Manager-only `DELETE` policies on the same tables.
- `app_settings` table (key/value) + `store_open` seed.
- `get_public_settings()` (anon) and `admin_set_setting()` (staff) functions.
- `admin_order_stats()` (staff) for the Overview cards.
- Re-created `set_order_status()` with **status-value validation**.

All statements are idempotent — safe to re-run. It never drops tables, deletes
data, changes column types, or weakens existing public/customer policies.

**Revenue semantics:** `revenue` = sum of `total` for all **non-cancelled**
orders. `delivered_revenue` = sum for **Delivered** orders only (truly settled).

---

## 4. Creating staff accounts

1. **Create the auth account** — Supabase Dashboard → Authentication → Users →
   *Add user*. Use email `username@hof.in` and a strong password
   (e.g. `chef@hof.in`). Copy the new user's **UID**.
2. **Grant the role** — Supabase SQL editor:

   ```sql
   -- Staff (can manage menu, categories, orders, settings)
   insert into public.staff_roles (user_id, role)
   values ('<AUTH-USER-UID>', 'staff')
   on conflict (user_id) do update set role = excluded.role;

   -- Manager (also gets delete privileges)
   insert into public.staff_roles (user_id, role)
   values ('<AUTH-USER-UID>', 'manager')
   on conflict (user_id) do update set role = excluded.role;
   ```

3. **Revoke** a role: `delete from public.staff_roles where user_id = '<UID>';`

Staff sign in at `/admin/login`. Non-staff accounts are signed out immediately
and the error never reveals whether an email exists.

### Password resets
Customer-facing "Forgot password?" opens WhatsApp (no email provider required).
For staff, reset the password in Supabase Dashboard → Authentication → Users.

### Email confirmation
This project logs in by **username**. If "Confirm email" is enabled, newly
registered customers receive no session until the owner confirms them (Supabase
Dashboard → Authentication → Providers → Email). For a smooth signup flow,
**disable "Confirm email"** unless you configure an SMTP provider.

---

## 5. Using the dashboard

| Section | What it does |
| --- | --- |
| **Overview** | Order counts + revenue (from `admin_order_stats`), recent orders |
| **Live Orders** | Active orders with status control + WhatsApp, realtime updates |
| **Menu** | Add/edit items, toggle availability, soft-deactivate; managers delete |
| **Categories** | Add/rename categories; delete blocked while items remain |
| **Orders & Customers** | Full history with search, status filter, pagination |
| **Settings** | Store open/closed toggle (via `admin_set_setting`) |

Order statuses: `Order Received → Preparing → Out for Delivery → Delivered`
(or `Cancelled` from any active state). Staff can only move orders along valid
transitions; **managers** may override. Realtime refreshes the list automatically.

If `003` has not been applied yet, menu/category/settings writes fail with a
`42501`-style error and the UI shows a friendly message.

---

## 6. Local development

```bash
npm install
npm run dev       # storefront at  /   ·  admin at  /admin
npm run build     # production build (admin is a separate chunk)
npm run preview   # preview the production build
```

There are no lint/test scripts in this project.

---

## 7. Deployment notes

- Set the Supabase env vars in your host's dashboard (Vercel/Netlify/etc.).
- Ensure SPA history fallback is enabled (rewrite unknown paths to
  `/index.html`) so a hard refresh on `/admin` works.
- The publishable key is safe to expose; the **service-role key never is**.
