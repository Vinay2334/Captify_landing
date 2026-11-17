// Pricing page behavior: wire plan buttons to Dodo Payments checkout.
//
// Checkout is gated behind a site sign-in so every payment carries the
// account's user id in metadata (the backend webhook reads it back and
// applies the plan no matter which email is entered at checkout):
//   signed in   -> Dodo hosted checkout with metadata_user_id set
//   signed out  -> signin.html?next=<this page>&plan=<planId>, which
//                  returns here signed in (pending plan continues).
//
// The extension appends ?email= and ?user_id= when it opens this page
// (see EXTENSION_WIRING.md): those hints prefill checkout and the sign-in
// form, but the site session's user is authoritative once signed in.
// Manual visitors just sign in with their Captify account email.
(function () {
  var cfg = window.CaptifySite || {};
  var A = window.CaptifySiteAuth || {};
  var PLANS = cfg.PLANS || [];

  function params() {
    return A.parseParams ? A.parseParams(window.location.search) : {};
  }

  var query = params();
  var knownEmail = query.email || "";
  var knownUserId = query.user_id || "";

  function planById(id) {
    for (var i = 0; i < PLANS.length; i++) {
      if (PLANS[i].id === id) return PLANS[i];
    }
    return null;
  }

  function isPlaceholder(plan) {
    return (
      !plan || !plan.dodoProductId || /REPLACE_WITH/i.test(String(plan.dodoProductId))
    );
  }

  function currentUrl() {
    try {
      return window.location.href;
    } catch (e) {
      return "pricing.html";
    }
  }

  // Fast synchronous identity: the stored session (with cached profile)
  // when still usable, else the extension's URL hints. An async
  // revalidation below corrects this if the stored token died.
  function initialIdentity() {
    var stored = null;
    try {
      stored = A.readStored ? A.readStored() : null;
    } catch (e) {
      stored = null;
    }
    if (stored && A.isUsable && A.isUsable(stored) && stored.user && stored.user.id) {
      return A.resolveIdentity({ sessionUser: stored.user });
    }
    return A.resolveIdentity
      ? A.resolveIdentity({ hintEmail: knownEmail, hintUserId: knownUserId })
      : { signedIn: false, userId: knownUserId, email: knownEmail };
  }

  function checkoutHref(plan, identity) {
    if (isPlaceholder(plan)) return null;
    if (identity.signedIn && identity.userId) {
      return A.buildCheckoutUrl(plan, identity);
    }
    return A.buildSigninUrl
      ? A.buildSigninUrl(currentUrl(), { plan: plan.id, email: identity.email || knownEmail })
      : null;
  }

  function paintAccount(identity) {
    var status = document.getElementById("account-status");
    var action = document.getElementById("account-action");
    if (!status || !action) return;
    if (identity.signedIn) {
      status.textContent = "Signed in as " + (identity.email || "your account");
      action.textContent = "Sign out";
      action.href = "signin.html?action=signout&next=" + encodeURIComponent(currentUrl());
    } else {
      status.textContent = "Sign in to link checkout to your account";
      action.textContent = "Sign in";
      action.href = A.buildSigninUrl
        ? A.buildSigninUrl(currentUrl(), { email: knownEmail })
        : "signin.html";
    }
  }

  function paintButtons(identity) {
    document.querySelectorAll("[data-checkout]").forEach(function (btn) {
      var plan = planById(btn.getAttribute("data-plan"));
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
      btn.href = checkoutHref(plan, identity) || "#";
    });
  }

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

  var identity = initialIdentity();
  paintAccount(identity);
  paintButtons(identity);

  // Slow-path correction: the stored token may have died since it was
  // saved (expiry, password change, revoke). Revalidate; if it is gone,
  // fall back to the signed-out buttons so checkout can't carry a dead id.
  if (A.ensureUser) {
    A.ensureUser().then(function (found) {
      var fresh = found && found.user
        ? A.resolveIdentity({ sessionUser: found.user })
        : A.resolveIdentity({ hintEmail: knownEmail, hintUserId: knownUserId });
      if (
        fresh.signedIn !== identity.signedIn ||
        fresh.userId !== identity.userId
      ) {
        identity = fresh;
        paintAccount(identity);
        paintButtons(identity);
      }
    }).catch(function () {
      /* stale buttons stay until the next load */
    });
  }
})();
