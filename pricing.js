// Pricing page behavior: wire plan buttons to Dodo Payments checkout.
//
// No SDK, no npm packages. Paid buttons redirect to Dodo's hosted checkout:
//   {DODO_CHECKOUT_BASE}/{productId}?redirect_url=...&email=...&metadata_user_id=...
// Dodo returns the customer to redirect_url (success.html) and appends
// payment_id/status/email as query params.
//
// The extension appends ?email= and ?user_id= when it opens this page
// (see EXTENSION_WIRING.md), so checkout is pre-attributed to the right
// account. Manual visitors just type their account email at checkout.
(function () {
  var cfg = window.CaptifySite || {};
  var PLANS = cfg.PLANS || [];

  function params() {
    var out = {};
    try {
      var search = String(location.search || "").replace(/^[?#]/, "");
      search.split("&").forEach(function (part) {
        var eq = part.indexOf("=");
        var key = eq < 0 ? part : part.slice(0, eq);
        if (!key) return;
        try {
          out[decodeURIComponent(key)] = decodeURIComponent(
            eq < 0 ? "" : part.slice(eq + 1)
          );
        } catch (e) { /* keep raw */ }
      });
    } catch (e) { /* no query */ }
    return out;
  }

  var query = params();
  var knownEmail = query.email || "";
  var knownUserId = query.user_id || "";

  function checkoutUrl(plan) {
    if (!plan || !plan.dodoProductId) return null;
    var url =
      String(cfg.DODO_CHECKOUT_BASE || "").replace(/\/$/, "") +
      "/" +
      encodeURIComponent(plan.dodoProductId);
    // Dodo static-link params (see integration guide): redirect_url is
    // required; metadata_* carries the account attribution the backend
    // webhook reads back (metadata_user_id first, email as fallback).
    var qs = [
      "redirect_url=" +
        encodeURIComponent(
          String(cfg.SITE_URL || "").replace(/\/$/, "") + "/success.html"
        ),
    ];
    if (knownEmail) qs.push("email=" + encodeURIComponent(knownEmail));
    if (knownUserId)
      qs.push("metadata_user_id=" + encodeURIComponent(knownUserId));
    qs.push("metadata_plan_id=" + encodeURIComponent(plan.id));
    return url + "?" + qs.join("&");
  }

  function isPlaceholder(plan) {
    return (
      !plan.dodoProductId ||
      /REPLACE_WITH/i.test(String(plan.dodoProductId))
    );
  }

  document.querySelectorAll("[data-checkout]").forEach(function (btn) {
    var plan = PLANS.find(function (p) { return p.id === btn.getAttribute("data-plan"); });
    if (!plan) return;
    if (isPlaceholder(plan)) {
      // Product IDs not pasted yet: keep the button visible but explain.
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        btn.textContent = "Checkout not connected yet";
        btn.setAttribute("aria-disabled", "true");
        setTimeout(function () {
          btn.textContent =
            btn.getAttribute("data-plan") === "pro"
              ? "Upgrade to Pro"
              : "Upgrade to Studio";
          btn.removeAttribute("aria-disabled");
        }, 2500);
      });
      return;
    }
    btn.href = checkoutUrl(plan) || "#";
  });

  // Free plan: no checkout. Extension users already have it; web visitors
  // are sent to install/sign in. The extension passes ?from=extension.
  document.querySelectorAll('[data-plan="free"]').forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      if (query.from === "extension") {
        e.preventDefault();
        window.close();
      }
    });
  });
})();
