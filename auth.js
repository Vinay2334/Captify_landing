// Shared Supabase Auth + checkout helpers for the Captify website.
//
// No SDK, no build step: plain fetch against the Supabase Auth REST API,
// the same pattern as verify.js and the extension's supabase-auth.js.
// Session persists in localStorage across visits and is refreshed before
// expiry. Identity resolution prefers the site's own signed-in session —
// URL hints (?email=, ?user_id=) are only prefill/fallback, never the
// authority for checkout attribution.
(function () {
  var A = (window.CaptifySiteAuth = window.CaptifySiteAuth || {});
  if (A.__loaded) return;
  A.__loaded = true;

  var STORAGE_KEY = "captifySiteSession";
  var REFRESH_SKEW_MS = 60 * 1000;

  function cfg() {
    return window.CaptifySite || {};
  }

  function projectUrl() {
    return String(cfg().SUPABASE_URL || "").replace(/\/$/, "");
  }

  function anonKey() {
    return cfg().SUPABASE_ANON_KEY || "";
  }

  function ls() {
    try {
      return window.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  // Parse "?a=b&c=d" or "#a=b&c=d" into an object. Used for query strings,
  // Google OAuth returns (fragment tokens), and Dodo return params.
  function parseParams(str) {
    var out = {};
    String(str || "")
      .replace(/^[?#]/, "")
      .split("&")
      .forEach(function (part) {
        var eq = part.indexOf("=");
        var key = eq < 0 ? part : part.slice(0, eq);
        if (!key) return;
        try {
          out[decodeURIComponent(key)] = decodeURIComponent(
            eq < 0 ? "" : part.slice(eq + 1),
          );
        } catch (e) {
          /* keep going */
        }
      });
    return out;
  }

  function readStored() {
    try {
      var raw = ls() && ls().getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStored(session) {
    try {
      if (session) ls().setItem(STORAGE_KEY, JSON.stringify(session));
      else ls().removeItem(STORAGE_KEY);
    } catch (e) {
      /* storage unavailable: memory-only */
    }
  }

  // A stored session is usable when it has a token that is not within the
  // refresh skew window. Pure (no I/O) so pages can decide synchronously.
  function isUsable(session) {
    return !!(
      session &&
      session.access_token &&
      typeof session.expires_at === "number" &&
      session.expires_at - Date.now() > REFRESH_SKEW_MS
    );
  }

  // Normalize the GoTrue fragment tokens (Google OAuth return) into the
  // stored session shape. Pure.
  function sessionFromFragment(params) {
    if (!params || !params.access_token) return null;
    return {
      access_token: params.access_token,
      refresh_token: params.refresh_token || null,
      expires_at: Date.now() + Number(params.expires_in || 3600) * 1000,
      user: null,
    };
  }

  function failMessage(res) {
    return res
      .json()
      .then(function (body) {
        return (
          (body && (body.msg || body.message || body.error_description)) ||
          "Request failed (" + res.status + ")"
        );
      })
      .catch(function () {
        return "Request failed (" + res.status + ")";
      });
  }

  function authHeaders(extra) {
    var h = { apikey: anonKey(), "Content-Type": "application/json" };
    for (var k in extra || {}) h[k] = extra[k];
    return h;
  }

  function toSession(data) {
    if (!data || !data.access_token) return null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
      user: data.user || null,
    };
  }

  // Refresh an expired session. Returns the new session, or null when the
  // backend rejected it (expired/invalid refresh clears the stored token).
  function refreshSession(session) {
    if (!session || !session.refresh_token) return Promise.resolve(null);
    return fetch(projectUrl() + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }).then(function (res) {
      if (!res.ok) {
        writeStored(null);
        return null;
      }
      return res.json().then(function (data) {
        var next = toSession(data);
        writeStored(next);
        return next;
      });
    });
  }

  // Usable access token for the site session, refreshing first when stale.
  // Resolves null when signed out or the refresh was rejected.
  function getAccessToken() {
    var session = readStored();
    if (!session) return Promise.resolve(null);
    if (isUsable(session)) return Promise.resolve(session.access_token);
    return refreshSession(session).then(function (next) {
      return next ? next.access_token : null;
    });
  }

  function fetchUser(accessToken) {
    return fetch(projectUrl() + "/auth/v1/user", {
      headers: authHeaders({ Authorization: "Bearer " + accessToken }),
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).catch(function () {
      return null;
    });
  }

  // Resolve the signed-in user ({ session, user }) or null. Cached profile
  // on the session is used when present; otherwise it is fetched once and
  // saved back so pages can render synchronously next time.
  function ensureUser() {
    return getAccessToken().then(function (token) {
      if (!token) return null;
      var session = readStored();
      if (session && session.user && session.user.id) {
        return { session: session, user: session.user };
      }
      return fetchUser(token).then(function (user) {
        if (!user) return null;
        session = readStored() || session;
        if (session) {
          session.user = user;
          writeStored(session);
        }
        return { session: session, user: user };
      });
    });
  }

  function signInWithPassword(email, password) {
    return fetch(projectUrl() + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: String(email || "").trim(), password: password }),
    }).then(function (res) {
      if (!res.ok) {
        return failMessage(res).then(function (msg) {
          throw new Error(msg);
        });
      }
      return res.json();
    }).then(function (data) {
      var session = toSession(data);
      writeStored(session);
      return { session: session, user: session && session.user };
    });
  }

  function signUp(email, password, firstName, lastName) {
    return fetch(projectUrl() + "/auth/v1/signup", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        email: String(email || "").trim(),
        password: password,
        data: { first_name: firstName, last_name: lastName },
      }),
    }).then(function (res) {
      if (!res.ok) {
        return failMessage(res).then(function (msg) {
          throw new Error(msg);
        });
      }
      return res.json();
    }).then(function (data) {
      // With "confirm email" on there is no session yet: the caller shows
      // "check your inbox" (verify.html handles the link).
      if (!data.access_token) return { session: null, user: data.user || null };
      var session = toSession(data);
      writeStored(session);
      return { session: session, user: session.user };
    });
  }

  function signOut() {
    var session = readStored();
    var token = session && session.access_token;
    writeStored(null);
    // Best-effort server revocation; local state is already cleared.
    if (!token) return Promise.resolve();
    return fetch(projectUrl() + "/auth/v1/logout", {
      method: "POST",
      headers: authHeaders({ Authorization: "Bearer " + token }),
    }).then(function () {}).catch(function () {});
  }

  // Hosted Supabase authorize URL for Google sign-in. The browser leaves
  // the site and returns to redirectTo with fragment tokens.
  function googleAuthorizeUrl(redirectTo) {
    return (
      projectUrl() +
      "/auth/v1/authorize?provider=google" +
      "&redirect_to=" +
      encodeURIComponent(redirectTo)
    );
  }

  // Checkout attribution. The site session's user is authoritative; URL
  // hints only fill gaps (prefill, or visitors the extension sent over).
  // Pure — pages pass what they have and get one answer.
  function resolveIdentity(args) {
    args = args || {};
    if (args.sessionUser && args.sessionUser.id) {
      return {
        signedIn: true,
        userId: String(args.sessionUser.id),
        email: args.sessionUser.email || args.hintEmail || "",
      };
    }
    return {
      signedIn: false,
      userId: args.hintUserId || "",
      email: args.hintEmail || "",
    };
  }

  // Dodo static payment link for a plan. success.html is the required
  // redirect_url; metadata_user_id is what the backend webhook reads back
  // (email first only when no user id is known).
  function buildCheckoutUrl(plan, identity) {
    if (!plan || !plan.dodoProductId) return null;
    var base = String(cfg().DODO_CHECKOUT_BASE || "").replace(/\/$/, "");
    var origin = "";
    try {
      origin = (window.location.origin || String(cfg().SITE_URL || "")).replace(/\/$/, "");
    } catch (e) {
      origin = String(cfg().SITE_URL || "").replace(/\/$/, "");
    }
    var qs = ["redirect_url=" + encodeURIComponent(origin + "/success.html")];
    if (identity && identity.email) {
      qs.push("email=" + encodeURIComponent(identity.email));
    }
    if (identity && identity.userId) {
      qs.push("metadata_user_id=" + encodeURIComponent(identity.userId));
    }
    qs.push("metadata_plan_id=" + encodeURIComponent(plan.id));
    return base + "/" + encodeURIComponent(plan.dodoProductId) + "?" + qs.join("&");
  }

  // Sign-in page URL preserving where to continue afterwards. `next` is an
  // absolute-or-root URL the sign-in page redirects back to after login.
  function buildSigninUrl(next, opts) {
    opts = opts || {};
    var qs = ["next=" + encodeURIComponent(next)];
    if (opts.plan) qs.push("plan=" + encodeURIComponent(opts.plan));
    if (opts.email) qs.push("email=" + encodeURIComponent(opts.email));
    return "signin.html?" + qs.join("&");
  }

  A.parseParams = parseParams;
  A.isUsable = isUsable;
  A.sessionFromFragment = sessionFromFragment;
  A.readStored = readStored;
  A.saveSession = writeStored;
  A.resolveIdentity = resolveIdentity;
  A.buildCheckoutUrl = buildCheckoutUrl;
  A.buildSigninUrl = buildSigninUrl;
  A.googleAuthorizeUrl = googleAuthorizeUrl;
  A.getAccessToken = getAccessToken;
  A.ensureUser = ensureUser;
  A.signInWithPassword = signInWithPassword;
  A.signUp = signUp;
  A.signOut = signOut;
})();
