## Treasurers of Bharat

Static website with a Supabase-backed waitlist form.

### Waitlist flow (DB + thank-you email)

The waitlist form posts to a Supabase Edge Function:

- **Browser** → `POST /functions/v1/waitlist-signup`
- **Edge Function**:
  - validates input
  - inserts into `public.waitlist_signups` using **service role** (server-side)
  - sends a thank-you email via **Gmail SMTP** (App Password)

This design keeps SMTP credentials and the Supabase service role key **off the frontend**.

### Supabase setup

#### 1) Push DB migrations

The repo contains migrations under `supabase/migrations/`.

Using the CLI:

```bash
supabase login
supabase link --project-ref bwpujcpdzezyvhqalvkf --password "<YOUR_DB_PASSWORD>"
supabase db push --password "<YOUR_DB_PASSWORD>"
```

If you previously created the table manually and `db push` fails with “relation already exists”, repair the migration history and retry:

```bash
supabase migration repair --status applied 20260409000000
supabase db push --password "<YOUR_DB_PASSWORD>"
```

#### 2) Gmail App Password (one-time)

To send mail from `treasurersofbharat@gmail.com`:

1. Enable **2-Step Verification** on the Google account.
2. Create a **Google App Password** for Mail.
3. Use that app password as `GMAIL_APP_PASSWORD` in Supabase secrets (below).

#### 3) Edge Function secrets

Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- `GMAIL_USER` = `treasurersofbharat@gmail.com`
- `GMAIL_APP_PASSWORD` = `<google app password>`
- `SUPABASE_URL` = `https://bwpujcpdzezyvhqalvkf.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = `<service_role key>` (Dashboard → Project Settings → API)

#### 4) Deploy the Edge Function

```bash
supabase functions deploy waitlist-signup
```

Note: this function is intended to be publicly callable from the website. If you see `401 Missing authorization header`, ensure the function has JWT verification disabled (this repo includes `supabase/functions/waitlist-signup/config.toml` with `verify_jwt = false`) and redeploy.

### Frontend configuration

The site uses `supabase.config.js` (committed) and optionally `config.js` (gitignored) for local overrides.

- `window.SUPABASE_URL` must be set to your project URL.
- The anon/publishable key is **public by design**; RLS protects tables. (After hardening, the waitlist insert happens via the Edge Function, not via `/rest/v1`.)

### Admin dashboard

The admin dashboard lives at `admin.html`. It uses **Supabase Auth (email + password)** in the browser, but it does **not** query the database directly.

Instead, it calls an Edge Function that:

- reads the user’s **Auth access token** from the `Authorization: Bearer …` header
- verifies it server-side with `auth.getUser(token)` (service role client)
- checks the signed-in user’s email against a single allowlisted admin email (`ADMIN_EMAIL`)
- returns waitlist rows using the **service role key** (server-side only)

**Note:** This function disables **gateway** JWT verification (`verify_jwt = false` in **`supabase/config.toml`** → `[functions.admin-waitlist-list]`, also mirrored in the function folder for clarity). Supabase’s gateway-level JWT check is built around legacy **JWT-shaped** anon keys; newer **publishable** keys (`sb_publishable_…`) are not JWTs and can trigger `401 {"code":401,"message":"Invalid JWT"}` before your code runs. Disabling gateway verification is safe here because the function still validates the user token and allowlists `ADMIN_EMAIL` before returning any rows.

#### 1) Create the admin user (Supabase Auth)

Supabase Dashboard → Authentication → Users → **Add user**:

- Email: your chosen admin email
- Password: choose a strong password

#### 2) Set Edge Function secrets (one-time)

Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- `SUPABASE_URL` = `https://bwpujcpdzezyvhqalvkf.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = `<service_role key>` (Dashboard → Project Settings → API)
- `ADMIN_EMAIL` = `<the exact admin email you created above>`

#### 3) Deploy the admin list function

```bash
supabase functions deploy admin-waitlist-list
```

JWT verification for Edge Functions is configured in **`supabase/config.toml`** under `[functions.admin-waitlist-list]` (`verify_jwt = false`). The CLI uses this file on deploy; if you skip it or the setting does not apply, the API gateway can return `401` / `Invalid JWT` before the function runs. If that still happens after deploy, force it with:

```bash
supabase functions deploy admin-waitlist-list --no-verify-jwt
```

#### 4) Use the dashboard

- Serve the site (see “Local development” below)
- Visit `admin.html`
- Sign in with the admin email/password

### Local development

This is a static site. Serve the repo with any static server, for example:

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.

