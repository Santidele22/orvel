const ALLOWED_PLANS = /* @__PURE__ */ new Set(["STARTER", "GROWTH", "PRO"]);
const FALLBACK_PATH = "/billing/test-checkout";
const CONTRACT_VALIDATION_MESSAGES = {
  PLAN_MAPPING_REQUIRED: "Falta configurar la relación del plan seleccionado. Reintentá en unos minutos.",
  PLAN_MAPPING_INVALID: "El plan seleccionado no está correctamente configurado. Contactá soporte.",
  PLAN_IDENTIFIER_INVALID: "El identificador del plan no es válido para checkout."
};
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
async function startCheckout(request, plan, idempotencyKey) {
  if (!plan || !ALLOWED_PLANS.has(plan)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_plan",
      message: "El plan seleccionado no está disponible."
    };
  }
  const supabaseUrl = "https://tzqgwziyiospmvpdgbnt.supabase.co";
  const supabaseAnonKey = "sb_publishable_JH2uY3XfVHFujz_KnMdZPA_rZnHsi8i";
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/create-subscription`;
  const authorization = request.headers.get("Authorization");
  const headers = {
    "Content-Type": "application/json",
    apikey: supabaseAnonKey,
    "x-client-info": "orvel-landing-server-checkout-start"
  };
  if (authorization) {
    headers.Authorization = authorization;
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  try {
    const upstreamResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ plan_code: plan, plan_identifier: plan })
    });
    if (!upstreamResponse.ok) {
      let code = "checkout_failed";
      let message = "No pudimos iniciar el pago. Reintentá en unos segundos.";
      try {
        const errorData = await upstreamResponse.json();
        if (typeof errorData?.error === "string" && errorData.error) {
          code = errorData.error;
        }
        if (typeof errorData?.code === "string" && errorData.code) {
          code = errorData.code;
        }
        if (typeof errorData?.message === "string" && errorData.message) {
          message = errorData.message;
        }
        if (CONTRACT_VALIDATION_MESSAGES[code]) {
          message = CONTRACT_VALIDATION_MESSAGES[code];
        }
      } catch {
      }
      return { ok: false, status: upstreamResponse.status, code, message };
    }
    const data = await upstreamResponse.json();
    const initPoint = data?.init_point;
    if (typeof initPoint !== "string" || !initPoint) {
      return {
        ok: false,
        status: 502,
        code: "checkout_error",
        message: "Mercado Pago no devolvió una URL de pago válida."
      };
    }
    return { ok: true, initPoint };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "checkout_retry",
      message: "No pudimos conectar con checkout. Reintentá en unos segundos."
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
  const idempotencyKey = requestUrl.searchParams.get("idempotency_key");
  const result = await startCheckout(request, plan, idempotencyKey);
  if (result.ok) {
    return redirect(result.initPoint, 303);
  }
  return redirect(toFallbackUrl(requestUrl, fallbackReason(result.code), plan).toString(), 303);
};
const POST = async ({ request }) => {
  let rawPlan = null;
  let idempotencyKey = null;
  try {
    const body = await request.json();
    rawPlan = typeof body?.plan === "string" ? body.plan : null;
    idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : null;
  } catch {
    return jsonResponse(
      { error: "invalid_json", message: "El pedido de checkout no tiene un JSON válido." },
      400
    );
  }
  const result = await startCheckout(request, normalizePlan(rawPlan), idempotencyKey);
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
