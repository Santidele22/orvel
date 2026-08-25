export const OPERATOR_WEB_PUSH_EVENT_TYPES = [
  "appointment.created",
  "appointment.cancelled",
  "appointment.rescheduled",
] as const;

export type VapidEnv = {
  VAPID_PRIVATE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
};

export type OperatorWebPushPayload = { title: string; body: string; url: string };
export type WebPushSubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };
export type WebPushOutboxRow = {
  id: string;
  business_id: string;
  event_type: string;
  title: string;
  body: string;
};

export type WebPushServiceClient = {
  from: (table: string) => any;
};

export function shouldSkipWebPush(env: VapidEnv): boolean {
  return !env.VAPID_PRIVATE_KEY?.trim() || !env.VAPID_PUBLIC_KEY?.trim();
}

export function isOperatorWebPushEventType(eventType: string): boolean {
  return (OPERATOR_WEB_PUSH_EVENT_TYPES as readonly string[]).includes(eventType);
}

export function buildOperatorWebPushPayload(input: { title: string; body: string }): OperatorWebPushPayload {
  return { title: input.title, body: input.body, url: "/dashboard/turnos" };
}

function goneStatus(statusCode: number | undefined): boolean {
  return statusCode === 410 || statusCode === 404;
}

function statusOf(error: unknown): number | undefined {
  return error && typeof error === "object" && typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : undefined;
}

export async function sendOperatorWebPushToSubscriptions(input: {
  subscriptions: WebPushSubscriptionRow[];
  payload: OperatorWebPushPayload;
  send: (subscription: WebPushSubscriptionRow, payload: OperatorWebPushPayload) => Promise<{ statusCode?: number } | void>;
  onGone: (subscriptionId: string) => Promise<void>;
}): Promise<{ sent: number; gone: number; failed: number }> {
  const tally = { sent: 0, gone: 0, failed: 0 };
  for (const subscription of input.subscriptions) {
    try {
      const result = await input.send(subscription, input.payload);
      if (goneStatus(result && typeof result === "object" ? result.statusCode : undefined)) {
        await input.onGone(subscription.id);
        tally.gone += 1;
      } else {
        tally.sent += 1;
      }
    } catch (error) {
      if (goneStatus(statusOf(error))) {
        await input.onGone(subscription.id);
        tally.gone += 1;
      } else {
        tally.failed += 1;
      }
    }
  }
  return tally;
}

async function defaultSendWebPush(subscription: WebPushSubscriptionRow, payload: OperatorWebPushPayload, env: VapidEnv) {
  const webpush = (await import("npm:web-push")).default;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT?.trim() || "mailto:noreply@localhost",
    env.VAPID_PUBLIC_KEY ?? "",
    env.VAPID_PRIVATE_KEY ?? "",
  );
  await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
  );
}

async function markOutbox(supabase: WebPushServiceClient, id: string, status: "sent" | "skipped" | "failed", error: string | null) {
  await supabase.from("web_push_outbox").update({ status, error, processed_at: new Date().toISOString() }).eq("id", id);
}

export async function processWebPushOutbox(input: {
  supabase: WebPushServiceClient;
  env: VapidEnv;
  send?: (subscription: WebPushSubscriptionRow, payload: OperatorWebPushPayload) => Promise<{ statusCode?: number } | void>;
}): Promise<{ skipped: "missing_vapid" } | { processed: number }> {
  if (shouldSkipWebPush(input.env)) {
    // Leave pending so a later key install can send the backlog.
    return { skipped: "missing_vapid" };
  }

  const pending = await input.supabase.from("web_push_outbox")
    .select("id, business_id, event_type, title, body")
    .eq("status", "pending")
    .limit(50);
  const rows = (pending.data ?? []) as WebPushOutboxRow[];
  const send = input.send ?? ((subscription, payload) => defaultSendWebPush(subscription, payload, input.env));

  for (const row of rows) {
    if (!isOperatorWebPushEventType(row.event_type)) {
      await markOutbox(input.supabase, row.id, "skipped", "unsupported_event_type");
      continue;
    }
    const loaded = await input.supabase.from("web_push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("business_id", row.business_id);
    try {
      const result = await sendOperatorWebPushToSubscriptions({
        subscriptions: (loaded.data ?? []) as WebPushSubscriptionRow[],
        payload: buildOperatorWebPushPayload(row),
        send,
        onGone: (subscriptionId) => input.supabase.from("web_push_subscriptions").delete().eq("id", subscriptionId),
      });
      const failed = result.failed > 0 && result.sent === 0;
      await markOutbox(input.supabase, row.id, failed ? "failed" : "sent", failed ? "send_failed" : null);
    } catch {
      await markOutbox(input.supabase, row.id, "skipped", "send_unavailable");
    }
  }
  return { processed: rows.length };
}
