function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
const GET = async ({ request }) => {
  const requestUrl = new URL(request.url);
  const checkoutSessionId = requestUrl.searchParams.get("checkout_session_id")?.trim();
  if (!checkoutSessionId) {
    return jsonResponse({ error: "missing_checkout_session", message: "Falta checkout_session_id." }, 400);
  }
  const supabaseUrl = "https://tzqgwziyiospmvpdgbnt.supabase.co";
  const supabaseAnonKey = "sb_publishable_JH2uY3XfVHFujz_KnMdZPA_rZnHsi8i";
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/subscription-status?checkout_session_id=${encodeURIComponent(checkoutSessionId)}`;
  const authorization = request.headers.get("Authorization");
  const headers = {
    apikey: supabaseAnonKey,
    "x-client-info": "orvel-landing-server-checkout-status"
  };
  if (authorization) headers.Authorization = authorization;
  try {
    const upstream = await fetch(endpoint, { method: "GET", headers });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return jsonResponse(
        {
          error: payload?.error || "status_check_failed",
          message: payload?.message || "No pudimos validar el estado de la suscripción."
        },
        upstream.status
      );
    }
    return jsonResponse(payload || { status: "pending" }, 200);
  } catch {
    return jsonResponse({ error: "status_unavailable", message: "Estado temporalmente no disponible." }, 503);
  }
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
