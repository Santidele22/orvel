import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  createSupabaseSessionHandoffRepository,
  createSessionHandoff,
  requireSessionHandoffEncryptionKey,
} from "../_shared/session-handoff.ts";
import {
  getSessionHandoffCorsHeaders,
  rejectDisallowedSessionHandoffOrigin,
} from "../_shared/session-handoff-cors.ts";

function json(body: Record<string, unknown>, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getSessionHandoffCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function createSupabaseAdmin() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl) throw new Error("SUPABASE_URL_NOT_CONFIGURED");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED");
  return createClient(supabaseUrl, serviceRoleKey);
}

function bearerToken(req: Request): string {
  const match = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) throw new Error("Authorization bearer token is required");
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getSessionHandoffCorsHeaders(req) });
  const originRejection = rejectDisallowedSessionHandoffOrigin(req);
  if (originRejection) return originRejection;
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, req);

  try {
    const body = await req.json() as Record<string, unknown>;
    const supabaseAdmin = createSupabaseAdmin();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(bearerToken(req));
    if (error || !user) return json({ error: "INVALID_AUTHORIZATION" }, 401, req);
    const result = await createSessionHandoff({
      authorization: req.headers.get("Authorization"),
      body,
      repository: createSupabaseSessionHandoffRepository(supabaseAdmin),
      encryptionKeyB64: requireSessionHandoffEncryptionKey(),
    });
    return json(result, 200, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "session handoff create failed";
    const status = /Authorization/i.test(message) ? 401 : /refresh|JSON/i.test(message) ? 400 : 500;
    return json({ error: "SESSION_HANDOFF_CREATE_FAILED", message }, status, req);
  }
});
