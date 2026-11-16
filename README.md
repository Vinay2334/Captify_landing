# Captify website — pricing + email verification

Separate static site the extension redirects to. No build step, no npm
packages, no bundler: open the files directly or serve this folder with any
static host.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Landing page: cinema-themed pitch (mock player, filmstrip, where/how, plan teaser). Uses Tailwind via CDN, so it needs network when served |
| `pricing.html` (+ `pricing.js`) | Payments page: all 3 monthly plans, checkout buttons via Dodo Payments hosted links |
| `verify.html` (+ `verify.js`) | Internal only — reached from Supabase confirmation emails, linked from nowhere on the site (set as Site URL in Supabase) |
| `success.html` | Dodo checkout return page (passed as `redirect_url` on every payment link) |

Shared: `styles.css`, `site-config.js` (all service wiring in one place).

## Plans (monthly, USD)

| Plan | Price | Minutes/mo | Notes |
|---|---|---|---|
| Starter | $0 | 100 (6,000 s) | Default for every signup; matches the `free` Supabase row and the extension menu |
| Pro | $12 | 1,000 | Most popular; price matches the extension's built-in Pro label |
| Studio | $29 | 4,000 | Teams: 3 seats, shared workspace |

Modeled on how caption/meeting extensions tier (limited free minutes →
generous solo plan → team plan). Quota numbers are illustrative — change
them in `pricing.html` AND in the Supabase `plans` rows (migration
`supabase/migrations/20261112000000_auth_quota.sql` seeds `free`; add `pro`
/ `studio` rows, e.g. `insert into public.plans ... values
('pro','Pro',60000,...), ('studio','Studio',240000,...)`).

## Going live (you do this — nothing to install)

1. **Dodo Payments**: with the dashboard **Test Mode toggle ON**, create 2
   monthly products (Pro $12, Studio $29), copy their test product IDs
   into `PLANS` in `site-config.js`. No return-URL setup needed — the page
   sends `success.html` as `redirect_url` on every link. Going live later
   means: new live products, live IDs in `PLANS`, and
   `DODO_CHECKOUT_BASE` back to `https://checkout.dodopayments.com/buy`.
2. **Supabase** → Authentication → URL Configuration: Site URL =
   `…/verify.html` (+ add to Redirect URLs). Keep **Confirm email** on;
   signup links will land on `verify.html`.
3. **Serve** this folder (any static host) and set `SITE_URL` in
   `site-config.js`.
4. **Extension**: see `EXTENSION_WIRING.md`.

## Local preview

```powershell
# from this folder — Python is already on this machine, no downloads
python -m http.server 8080
# open http://localhost:8080/index.html in a browser
```

## After a payment: webhook (built, needs your secrets to run)

`server_new` has `POST /api/v1/billing/dodo/webhook` (`app/api/billing.py`
+ `app/services/billing.py`, tests in `tests/test_billing.py`). It verifies
the Standard Webhooks signature, maps the Dodo product to a plan via
`DODO_PLAN_MAP`, and sets `profiles.plan_id` — by `metadata_user_id` from
the checkout link first, by matching the Dodo customer email second.
`subscription.cancelled` / `subscription.expired` drop the account back to
`DODO_FREE_PLAN_ID` (`free`). The quota flow (`authorize`/`commit`) picks
the new plan up automatically on the next session.

To switch it on: set `DODO_WEBHOOK_SECRET` + `DODO_PLAN_MAP` in the backend
`.env` (see `.env.example`), register the URL in Dodo (Developer →
Webhooks), and apply
`supabase/migrations/20261116000000_billing_plans.sql` so the `pro` /
`studio` rows exist. With no secret the endpoint answers 503.
