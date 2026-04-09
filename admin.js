(function () {
  function getConfigError() {
    var url = typeof window.SUPABASE_URL === "string" ? window.SUPABASE_URL.trim() : "";
    var key =
      typeof window.SUPABASE_ANON_KEY === "string" ? window.SUPABASE_ANON_KEY.trim() : "";
    if (!url || !key || /YOUR/i.test(url) || /YOUR/i.test(key)) {
      return "Admin is not configured. Edit supabase.config.js with your Supabase URL and anon key.";
    }
    return null;
  }

  function setStatus(el, type, message) {
    if (!el) return;
    el.hidden = false;
    el.classList.remove("form__status--success", "form__status--error");
    if (type === "success") el.classList.add("form__status--success");
    if (type === "error") el.classList.add("form__status--error");
    el.textContent = message;
    el.focus();
  }

  function clearStatus(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
    el.classList.remove("form__status--success", "form__status--error");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso || "");
      return d.toLocaleString();
    } catch (e) {
      return String(iso || "");
    }
  }

  function renderRows(rows) {
    var table = document.getElementById("admin-table");
    var body = document.getElementById("admin-table-body");
    var empty = document.getElementById("admin-empty");
    if (!table || !body || !empty) return;

    body.innerHTML = "";

    if (!rows || !rows.length) {
      table.hidden = true;
      empty.hidden = false;
      empty.textContent = "No signups found.";
      return;
    }

    empty.hidden = true;
    table.hidden = false;

    rows.forEach(function (r) {
      var tr = document.createElement("tr");

      var linkedin = r.linkedin_url
        ? '<a href="' +
          escapeHtml(r.linkedin_url) +
          '" target="_blank" rel="noopener noreferrer">Profile</a>'
        : "";

      tr.innerHTML =
        "<td>" +
        escapeHtml(formatDate(r.created_at)) +
        "</td>" +
        "<td>" +
        escapeHtml(r.full_name || "") +
        "</td>" +
        "<td><a href=\"mailto:" +
        escapeHtml(r.email || "") +
        "\">" +
        escapeHtml(r.email || "") +
        "</a></td>" +
        "<td>" +
        escapeHtml(r.designation || "") +
        "</td>" +
        "<td>" +
        linkedin +
        "</td>" +
        "<td>" +
        escapeHtml(r.phone || "") +
        "</td>" +
        "<td>" +
        escapeHtml(r.form_type || "") +
        "</td>";

      body.appendChild(tr);
    });
  }

  async function main() {
    var form = document.querySelector(".form--admin-login");
    var statusEl = document.getElementById("admin-status");
    var logoutBtn = document.getElementById("admin-logout");
    var refreshBtn = document.getElementById("admin-refresh");
    var userEl = document.getElementById("admin-user");
    var empty = document.getElementById("admin-empty");

    if (empty) {
      empty.hidden = false;
      empty.textContent = "Checking session…";
    }

    var cfgErr = getConfigError();
    if (cfgErr) {
      setStatus(statusEl, "error", cfgErr);
      if (empty) {
        empty.hidden = false;
        empty.textContent = "Admin is not configured.";
      }
      return;
    }

    // ESM import so this page stays static-host friendly.
    var mod = await import("https://esm.sh/@supabase/supabase-js@2");
    var createClient = mod.createClient;

    var supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    async function loadRows() {
      clearStatus(statusEl);
      var sessionRes = await supabase.auth.getSession();
      var session = sessionRes && sessionRes.data ? sessionRes.data.session : null;

      if (!session || !session.access_token) {
        if (userEl) userEl.textContent = "";
        renderRows([]);
        if (empty) {
          empty.hidden = false;
          empty.textContent = "Sign in to load data.";
        }
        if (logoutBtn) logoutBtn.hidden = true;
        if (refreshBtn) refreshBtn.hidden = true;
        return;
      }

      if (userEl) userEl.textContent = "Signed in as " + (session.user && session.user.email ? session.user.email : "admin");
      if (logoutBtn) logoutBtn.hidden = false;
      if (refreshBtn) refreshBtn.hidden = false;

      if (empty) {
        empty.hidden = false;
        empty.textContent = "Loading…";
      }

      var base = window.SUPABASE_URL.replace(/\/?$/, "");
      var res = await fetch(base + "/functions/v1/admin-waitlist-list", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + session.access_token,
          apikey: window.SUPABASE_ANON_KEY,
        },
      });

      if (res.status === 401) {
        setStatus(statusEl, "error", "Your session expired. Please sign in again.");
        await supabase.auth.signOut();
        return;
      }
      if (res.status === 403) {
        setStatus(statusEl, "error", "Access denied. This account is not allowed.");
        renderRows([]);
        return;
      }
      if (!res.ok) {
        var text = await res.text();
        setStatus(statusEl, "error", "Could not load data (" + res.status + ").");
        console.error("[admin] list function error", res.status, text);
        renderRows([]);
        return;
      }

      var data = await res.json();
      renderRows((data && data.rows) || []);
    }

    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        clearStatus(statusEl);

        var fd = new FormData(form);
        var email = (fd.get("email") || "").toString().trim();
        var password = (fd.get("password") || "").toString();

        try {
          var r = await supabase.auth.signInWithPassword({ email: email, password: password });
          if (r.error) {
            setStatus(statusEl, "error", r.error.message || "Sign-in failed.");
            return;
          }
          setStatus(statusEl, "success", "Signed in.");
          await loadRows();
        } catch (err) {
          console.error("[admin] sign-in error", err);
          setStatus(statusEl, "error", "Sign-in failed. Please try again.");
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        clearStatus(statusEl);
        await supabase.auth.signOut();
        setStatus(statusEl, "success", "Signed out.");
        await loadRows();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        loadRows();
      });
    }

    supabase.auth.onAuthStateChange(function () {
      loadRows();
    });

    await loadRows();
  }

  main().catch(function (err) {
    console.error("[admin] unexpected error", err);
    var statusEl = document.getElementById("admin-status");
    setStatus(statusEl, "error", "Something went wrong loading the admin dashboard.");
  });
})();

