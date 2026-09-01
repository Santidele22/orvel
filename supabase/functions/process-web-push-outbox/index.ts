import { createClient } from "@supabase/supabase-js";
import { isPrivilegedWebPushAuthorization, processWebPushOutbox } from "../_shared/process-web-push-outbox.ts";

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (req) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorized = isPrivilegedWebPushAuthorization({
    authorizationHeader: req.headers.get("Authorization"),
    serviceRoleKey,
  });
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
