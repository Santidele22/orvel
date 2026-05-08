const ALLOWED_PLANS = /* @__PURE__ */ new Set(["STARTER", "GROWTH", "PRO"]);
const FALLBACK_PATH = "/billing/test-checkout";
function normalizePlan(rawPlan) {
  const normalized = rawPlan?.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "STARTED" || normalized === "BASIC") return "STARTER";
  if (normalized === "MEDIUM") return "GROWTH";
  return normalized;
}
function toFallbackUrl(requestUrl, reason, plan) {
  const fallback = new URL(FALLBACK_PATH, requestUrl);
  if (plan) {
    fallback.searchParams.set("plan", plan);
  }
  fallback.searchParams.set("checkout_error", reason);
  fallback.searchParams.set("retry", "1");
  return fallback;
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
async function startCheckout(request, plan) {
  if (!plan || !ALLOWED_PLANS.has(plan)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_plan",
      message: "El plan seleccionado no está disponible."
    };
  }
  {
    return {
      ok: false,
      status: 500,
      code: "checkout_config_error",
      message: "La configuración de checkout no está disponible."
    };
  }
}
function fallbackReason(code) {
  if (code === "BUSINESS_REQUIRED") return "business_required";
  if (code === "EMAIL_REQUIRED") return "email_required";
  return code.toLowerCase();
}
const GET = async ({ request, redirect }) => {
  const requestUrl = new URL(request.url);
  const plan = normalizePlan(requestUrl.searchParams.get("plan"));
  const result = await startCheckout(request, plan);
  if (result.ok) {
    return redirect(result.initPoint, 303);
  }
  return redirect(toFallbackUrl(requestUrl, fallbackReason(result.code), plan).toString(), 303);
};
const POST = async ({ request }) => {
  let rawPlan = null;
  try {
    const body = await request.json();
    rawPlan = typeof body?.plan === "string" ? body.plan : null;
  } catch {
    return jsonResponse(
      { error: "invalid_json", message: "El pedido de checkout no tiene un JSON válido." },
      400
    );
  }
  const result = await startCheckout(request, normalizePlan(rawPlan));
  if (result.ok) {
    return jsonResponse({ init_point: result.initPoint });
  }
  return jsonResponse({ error: result.code, message: result.message }, result.status);
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  GET,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
