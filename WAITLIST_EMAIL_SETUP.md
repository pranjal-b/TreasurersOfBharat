## Waitlist signup + thank-you email (Supabase Edge Function)

This repo uses a Supabase Edge Function (`waitlist-signup`) to:
- Validate form input
- Insert into `public.waitlist_signups` using the **service role** key (server-side)
- Send a thank-you email via **Gmail SMTP** (App Password)

### 1) Create a Gmail App Password (one-time)

1. Enable **2-Step Verification** on the Google account you want to send from (example: `treasurersofbharat@gmail.com`)
2. Create an **App Password** for Mail
3. Keep the 16-character app password handy (this is what you store as a Supabase secret)

### 2) Set Supabase Edge Function secrets

Set these secrets for your project (Dashboard → Project Settings → Edge Functions → Secrets, or via CLI):

- `GMAIL_USER` (example: `treasurersofbharat@gmail.com`)
- `GMAIL_APP_PASSWORD` (the app password, not your normal Google password)
- `SUPABASE_URL` (your project URL)
- `SUPABASE_SERVICE_ROLE_KEY` (service role key; keep this server-side only)

### 3) Deploy the function

From the repo root:

```bash
supabase functions deploy waitlist-signup
```

### 4) Frontend config

Ensure `supabase.config.js` (or your local `config.js`) sets:
- `window.SUPABASE_URL`

The browser will submit to:
- `${SUPABASE_URL}/functions/v1/waitlist-signup`

