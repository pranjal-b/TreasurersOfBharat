(function () {
  var form = document.querySelector(".form--waitlist");
  if (!form) return;

  var statusEl = document.getElementById("waitlist-form-status");
  var submitBtn = form.querySelector('button[type="submit"]');

  function setStatus(type, message) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.classList.remove("form__status--success", "form__status--error");
    if (type === "success") {
      statusEl.classList.add("form__status--success");
    } else if (type === "error") {
      statusEl.classList.add("form__status--error");
    }
    statusEl.textContent = message;
  }

  function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.classList.remove("form__status--success", "form__status--error");
  }

  function getConfigError() {
    var url = typeof window.SUPABASE_URL === "string" ? window.SUPABASE_URL.trim() : "";
    var key =
      typeof window.SUPABASE_ANON_KEY === "string" ? window.SUPABASE_ANON_KEY.trim() : "";
    if (!url || !key || /YOUR/i.test(url) || /YOUR/i.test(key)) {
      return "Waitlist is not configured. Edit supabase.config.js with your Supabase URL and anon key (see config.example.js).";
    }
    return null;
  }

  function parseErrorBody(text) {
    try {
      var j = JSON.parse(text);
      if (j && typeof j.message === "string") return j.message;
      if (j && typeof j.error_description === "string") return j.error_description;
      if (j && typeof j.hint === "string") return j.hint;
    } catch (e) {
      /* ignore */
    }
    if (text && text.length < 200) return text;
    return "Something went wrong. Please try again.";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearStatus();

    var cfgErr = getConfigError();
    if (cfgErr) {
      setStatus("error", cfgErr);
      console.error(
        "[waitlist] Missing or placeholder Supabase config. Edit supabase.config.js."
      );
      return;
    }

    var base = window.SUPABASE_URL.replace(/\/?$/, "");
    var key = window.SUPABASE_ANON_KEY.trim();

    var fd = new FormData(form);
    var fullName = (fd.get("full_name") || "").toString().trim();
    var email = (fd.get("email") || "").toString().trim();
    var designation = (fd.get("designation") || "").toString().trim();
    var linkedinUrl = (fd.get("linkedin_url") || "").toString().trim();
    var phoneRaw = (fd.get("phone") || "").toString().trim();
    var formType = (fd.get("form_type") || "waitlist").toString().trim() || "waitlist";

    var payload = {
      full_name: fullName,
      email: email,
      designation: designation,
      linkedin_url: linkedinUrl,
      form_type: formType,
    };
    if (phoneRaw) payload.phone = phoneRaw;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");
    }

    fetch(base + "/functions/v1/waitlist-signup", {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.status === 201 || res.status === 200) {
          setStatus("success", "You are on the list. We will be in touch soon.");
          form.reset();
          if (statusEl) statusEl.focus();
          return;
        }
        return res.text().then(function (text) {
          var msg = parseErrorBody(text);
          console.error("[waitlist] Waitlist function error", res.status, text);
          setStatus("error", msg);
          if (statusEl) statusEl.focus();
        });
      })
      .catch(function (err) {
        console.error("[waitlist] Network error", err);
        setStatus(
          "error",
          "Could not connect. Check your connection or try again later."
        );
        if (statusEl) statusEl.focus();
      })
      .finally(function () {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.removeAttribute("aria-busy");
        }
      });
  });
})();
