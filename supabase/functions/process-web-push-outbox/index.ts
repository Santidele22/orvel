import { createClient } from "@supabase/supabase-js";
import { processWebPushOutbox } from "../_shared/process-web-push-outbox.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function constantTimeEquals(a: string | null, b: string): boolean {
  if (a === null) return false;
  let difference = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function readCronKey(req: Request): string | null {
  const directHeader = req.headers.get("CRON_KEY") ?? req.headers.get("x-cron-key");
  if (directHeader) return directHeader;
  const authorization = req.headers.get("Authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
}

Deno.serve(async (req) => {
  const provided = readCronKey(req);
  const expectedCronKey = Deno.env.get("CRON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorized =
    (Boolean(expectedCronKey) && constantTimeEquals(provided, expectedCronKey ?? '')) ||
    (Boolean(serviceRoleKey) && constantTimeEquals(provided, serviceRoleKey ?? ''));
  if (!authorized) {
    return new Response(JSON.stringify({ success: false, error: "UNAUTHORIZED" }), { status: 401, headers: jsonHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ success: false, error: "SERVER_CONFIGURATION_ERROR" }), { status: 500, headers: jsonHeaders });
  }

  const result = await processWebPushOutbox({
    supabase: createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    env: {
      VAPID_PRIVATE_KEY: Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
      VAPID_PUBLIC_KEY: Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
      VAPID_SUBJECT: Deno.env.get("VAPID_SUBJECT") ?? "",
    },
  });

  return new Response(JSON.stringify({ success: true, ...result }), { status: 200, headers: jsonHeaders });
});
