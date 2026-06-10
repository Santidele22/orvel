// appointment-reminders-24h Edge Function
// Secure scheduler/manual entrypoint for enqueue_appointment_reminders_24h.

import { createClient } from "@supabase/supabase-js";

const jsonHeaders = { "Content-Type": "application/json" };

function constantTimeEquals(a: string | null, b: string): boolean {
  if (a === null) {
    return false;
  }

  let difference = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function readCronKey(req: Request): string | null {
  const directHeader = req.headers.get("CRON_KEY") ?? req.headers.get("x-cron-key");
  if (directHeader) {
    return directHeader;
  }

  const authorization = req.headers.get("Authorization");
  const bearerPrefix = "Bearer ";

  return authorization?.startsWith(bearerPrefix) ? authorization.slice(bearerPrefix.length) : null;
}

Deno.serve(async (req) => {
  const expectedCronKey = Deno.env.get("CRON_KEY");
  const providedCronKey = readCronKey(req);

  if (!expectedCronKey || !constantTimeEquals(providedCronKey, expectedCronKey)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "UNAUTHORIZED",
      }),
      { status: 401, headers: jsonHeaders },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "SERVER_CONFIGURATION_ERROR",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.rpc("enqueue_appointment_reminders_24h");

    if (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "REMINDER_ENQUEUE_FAILED",
        }),
        { status: 500, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        enqueued: data ?? 0,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: "REMINDER_ENQUEUE_FAILED",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
