import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

function getBearerToken(req: Request) {
  const h = req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

type WaitlistRow = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  designation: string;
  linkedin_url: string;
  phone: string | null;
  form_type: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ ok: false, message: "Method not allowed." }, { status: 405 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, message: "Server is not configured (missing Supabase secrets)." },
      { status: 500 },
    );
  }
  if (!ADMIN_EMAIL) {
    return jsonResponse(
      { ok: false, message: "Server is not configured (missing ADMIN_EMAIL)." },
      { status: 500 },
    );
  }

  const token = getBearerToken(req);
  if (!token) {
    return jsonResponse({ ok: false, message: "Missing authorization header." }, { status: 401 });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    console.error("[admin-waitlist-list] getUser failed", userError);
    return jsonResponse({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const email = (userData.user.email ?? "").trim().toLowerCase();
  if (!email || email !== ADMIN_EMAIL) {
    return jsonResponse({ ok: false, message: "Forbidden." }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.max(1, Math.min(500, Number(limitRaw ?? "200") || 200));

  const { data: rows, error: listError } = await supabaseAdmin
    .from("waitlist_signups")
    .select("id, created_at, full_name, email, designation, linkedin_url, phone, form_type")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<WaitlistRow[]>();

  if (listError) {
    console.error("[admin-waitlist-list] select failed", listError);
    return jsonResponse({ ok: false, message: "Could not load waitlist." }, { status: 500 });
  }

  return jsonResponse({ ok: true, rows: rows ?? [] });
});

