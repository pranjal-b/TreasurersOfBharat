import nodemailer from "npm:nodemailer";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WaitlistPayload = {
  full_name: string;
  email: string;
  designation: string;
  linkedin_url: string;
  phone?: string;
  form_type?: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(JSON.stringify(body), { ...init, headers });
}

function isValidEmail(email: string) {
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isLikelyHttpUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validatePayload(raw: unknown): { ok: true; value: WaitlistPayload } | {
  ok: false;
  message: string;
} {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Invalid JSON body." };
  const r = raw as Record<string, unknown>;

  const full_name = typeof r.full_name === "string" ? r.full_name.trim() : "";
  const email = typeof r.email === "string" ? r.email.trim() : "";
  const designation = typeof r.designation === "string" ? r.designation.trim() : "";
  const linkedin_url = typeof r.linkedin_url === "string" ? r.linkedin_url.trim() : "";
  const phone = typeof r.phone === "string" ? r.phone.trim() : undefined;
  const form_type = typeof r.form_type === "string" ? r.form_type.trim() : "waitlist";

  if (!full_name) return { ok: false, message: "Full name is required." };
  if (full_name.length > 200) return { ok: false, message: "Full name is too long." };

  if (!email) return { ok: false, message: "Email is required." };
  if (!isValidEmail(email)) return { ok: false, message: "Email is invalid." };

  if (!designation) return { ok: false, message: "Designation is required." };
  if (designation.length > 200) return { ok: false, message: "Designation is too long." };

  if (!linkedin_url) return { ok: false, message: "LinkedIn URL is required." };
  if (!isLikelyHttpUrl(linkedin_url)) return { ok: false, message: "LinkedIn URL must be a valid http(s) URL." };
  if (linkedin_url.length > 500) return { ok: false, message: "LinkedIn URL is too long." };

  if (phone && phone.length > 50) return { ok: false, message: "Phone is too long." };
  if (!form_type) return { ok: false, message: "form_type is required." };
  if (form_type.length > 50) return { ok: false, message: "form_type is too long." };

  return {
    ok: true,
    value: { full_name, email, designation, linkedin_url, phone, form_type },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, message: "Method not allowed." }, { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
  const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, message: "Server is not configured (missing Supabase secrets)." },
      { status: 500 },
    );
  }
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return jsonResponse(
      { ok: false, message: "Server is not configured (missing Gmail SMTP secrets)." },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const v = validatePayload(body);
  if (!v.ok) return jsonResponse({ ok: false, message: v.message }, { status: 400 });

  const payload = v.value;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Best-effort dedupe to reduce double submissions/retries.
    const existing = await supabaseAdmin
      .from("waitlist_signups")
      .select("id")
      .ilike("email", payload.email)
      .limit(1)
      .maybeSingle();

    if (!existing.error && !existing.data) {
      const { error: insertError } = await supabaseAdmin.from("waitlist_signups").insert({
        full_name: payload.full_name,
        email: payload.email,
        designation: payload.designation,
        linkedin_url: payload.linkedin_url,
        phone: payload.phone ?? null,
        form_type: payload.form_type ?? "waitlist",
      });
      if (insertError) {
        console.error("[waitlist-signup] insert failed", insertError);
        return jsonResponse({ ok: false, message: "Could not save signup. Please try again." }, { status: 500 });
      }
    } else if (existing.error) {
      console.error("[waitlist-signup] dedupe check failed", existing.error);
      return jsonResponse({ ok: false, message: "Could not save signup. Please try again." }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const subject = "Thanks for joining the Treasurers of Bharat waitlist";
    const safeName = payload.full_name.replace(/[<>\n\r]/g, "").slice(0, 200);

    const text = [
      `Hi ${safeName},`,
      "",
      "Thanks for joining the Treasurers of Bharat waitlist.",
      "We’ve received your details and we’ll be in touch soon.",
      "",
      "— Treasurers of Bharat",
    ].join("\n");

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.5;">
        <p>Hi ${escapeHtml(safeName)},</p>
        <p>Thanks for joining the <strong>Treasurers of Bharat</strong> waitlist.</p>
        <p>We’ve received your details and we’ll be in touch soon.</p>
        <p style="margin-top: 24px;">— Treasurers of Bharat</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Treasurers of Bharat" <${GMAIL_USER}>`,
      to: payload.email,
      subject,
      text,
      html,
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("[waitlist-signup] unexpected error", err);
    return jsonResponse({ ok: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }
});

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
