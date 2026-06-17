import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import {
  createSupabaseSessionHandoffRepository,
  redeemSessionHandoff,
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

function createRepository() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl) throw new Error("SUPABASE_URL_NOT_CONFIGURED");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED");
  return createSupabaseSessionHandoffRepository(createClient(supabaseUrl, serviceRoleKey));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getSessionHandoffCorsHeaders(req) });
  const originRejection = rejectDisallowedSessionHandoffOrigin(req);
  if (originRejection) return originRejection;
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405, req);

  try {
    const body = await req.json() as Record<string, unknown>;
    const handoff = typeof body.handoff === "string" ? body.handoff : "";
    const session = await redeemSessionHandoff({
      handoff,
      repository: createRepository(),
      encryptionKeyB64: requireSessionHandoffEncryptionKey(),
    });
    return json(session, 200, req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "session handoff redeem failed";
    const status = /handoff is required/i.test(message) ? 400 : /not found|redeemed|expired/i.test(message) ? 410 : 500;
    return json({ error: "SESSION_HANDOFF_REDEEM_FAILED", message }, status, req);
  }
});
