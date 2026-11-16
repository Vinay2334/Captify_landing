// Captify website — single source of truth for external service wiring.
//
// HOW TO GO LIVE (you do these steps, nothing is downloaded by the agent):
//   1. Dodo Payments dashboard → create 3 monthly Products (Free needs no
//      product — it is the default Supabase plan). Paste each Product ID
//      into PLANS below (format: prod_... or live product slug).
//   2. Nothing to set in Dodo for returns: pricing.js passes
//      <SITE_URL>/success.html as `redirect_url` on every payment link
//      (Dodo appends ?status=...&...).
//   3. Supabase dashboard → Authentication → URL Configuration → Site URL
//      = <SITE_URL>/verify.html, and add it under Redirect URLs.
//      Email template "{{ .ConfirmationURL }}" will then land here.
//   4. Serve this folder statically (any static host) and set SITE_URL.
//   5. Point the extension at it — see EXTENSION_WIRING.md.

window.CaptifySite = {
  // Public origin of this site, no trailing slash. Used to build absolute
  // links the extension and Supabase redirect to. Serve this folder on the
  // same port (e.g. `python -m http.server 8080`) so the Dodo `redirect_url`
  // lands back here after test checkout.
  SITE_URL: "http://localhost:8080",

  // Supabase project (public anon key only — same values as
  // extensionRTC/src/caption-overlay/lib/supabase-config.js).
  SUPABASE_URL: "https://hsuuleiisdgbidbwkqae.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_namQsShONsZJviiyWtulnA_wZ4NWUPW",

  // Dodo Payments static payment-link base:
  // `https://{checkout,test.checkout}.dodopayments.com/buy/{product_id}`.
  // TEST MODE uses test.checkout.dodopayments.com and test products; LIVE
  // uses checkout.dodopayments.com and live products — switch this base
  // (and the product IDs) when you go live. Per Dodo's docs, payment links
  // take `redirect_url` (required — where Dodo sends the customer back,
  // appending payment_id/status/email), `email` to pre-fill, and custom
  // fields as `metadata_*` (e.g. metadata_user_id). Native checkout links
  // need no SDK and no npm install.
  DODO_CHECKOUT_BASE: "https://test.checkout.dodopayments.com/buy",

  // One entry per paid plan. `dodoProductId` is the ONLY value you must
  // replace with a real Dodo product id. `id` must match the `plans.id`
  // row in Supabase (see supabase/migrations/20261112000000_auth_quota.sql
  // for the `free` seed; add `pro` and `studio` rows there).
  PLANS: [
    {
      id: "free",
      name: "Starter",
      priceMonthlyUSD: 0,
      // Free plan: no checkout — the extension signs users up on this plan.
      dodoProductId: null,
    },
    {
      id: "pro",
      name: "Pro",
      priceMonthlyUSD: 12,
      dodoProductId: "pdt_0Ns4n6DtVvE5GFaoMwVqt",
    },
    {
      id: "studio",
      name: "Studio",
      priceMonthlyUSD: 29,
      dodoProductId: "pdt_0Ns4qzhAbSngnV0wZOLYf",
    },
  ],
};
