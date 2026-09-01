import { assertEquals, assertMatch } from "jsr:@std/assert";

import {
  buildOperatorWebPushPayload,
  isOperatorWebPushEventType,
  isPrivilegedWebPushAuthorization,
  processWebPushOutbox,
  resolveWebPushDeliveryStatus,
  shouldSkipWebPush,
  type WebPushOutboxRow,
  type WebPushServiceClient,
  type WebPushSubscriptionRow,
} from "./process-web-push-outbox.ts";

Deno.test("skips when either VAPID key is missing", () => {
  assertEquals(
    shouldSkipWebPush({ VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: "x" }),
    true,
  );
  assertEquals(
    shouldSkipWebPush({ VAPID_PRIVATE_KEY: "k", VAPID_PUBLIC_KEY: "" }),
    true,
  );
  assertEquals(
    shouldSkipWebPush({ VAPID_PRIVATE_KEY: "k", VAPID_PUBLIC_KEY: "p" }),
    false,
  );
});

Deno.test("operator payload reuses inbox title/body and opens turnos", () => {
  assertEquals(
    buildOperatorWebPushPayload({ title: "Nuevo turno", body: "Ana reservó Corte." }),
    { title: "Nuevo turno", body: "Ana reservó Corte.", url: "/dashboard/turnos" },
  );
});

Deno.test("zero send tally is skipped with no_subscriptions, not sent", () => {
  assertEquals(resolveWebPushDeliveryStatus({ sent: 0, gone: 0, failed: 0 }), {
    status: "skipped",
    error: "no_subscriptions",
  });
  assertEquals(resolveWebPushDeliveryStatus({ sent: 1, gone: 0, failed: 0 }), {
    status: "sent",
    error: null,
  });
  assertEquals(resolveWebPushDeliveryStatus({ sent: 1, gone: 0, failed: 2 }), {
    status: "sent",
    error: null,
  });
  assertEquals(resolveWebPushDeliveryStatus({ sent: 0, gone: 0, failed: 2 }), {
    status: "failed",
    error: "send_failed",
  });
});

Deno.test("appointment inbox event types include reminder for operator push", () => {
  assertEquals(isOperatorWebPushEventType("appointment.created"), true);
  assertEquals(isOperatorWebPushEventType("appointment.cancelled"), true);
  assertEquals(isOperatorWebPushEventType("appointment.rescheduled"), true);
  assertEquals(isOperatorWebPushEventType("appointment.reminder"), true);
  assertEquals(isOperatorWebPushEventType("system.welcome"), false);
});

function unsignedJwt(role: string): string {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ role })}.sig`;
}

Deno.test("isPrivilegedWebPushAuthorization accepts exact service_role key and JWT role", () => {
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: "Bearer service-role-material",
      serviceRoleKey: "service-role-material",
    }),
    true,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: `Bearer ${unsignedJwt("service_role")}`,
      serviceRoleKey: "other-service-role-material",
    }),
    true,
  );
});

Deno.test("isPrivilegedWebPushAuthorization rejects missing, invalid, public, and CRON_KEY bearers", () => {
  assertEquals(
    isPrivilegedWebPushAuthorization({ authorizationHeader: null, serviceRoleKey: "svc" }),
    false,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({ authorizationHeader: "Bearer not-a-jwt", serviceRoleKey: "svc" }),
    false,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: `Bearer ${unsignedJwt("anon")}`,
      serviceRoleKey: "svc",
    }),
    false,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: `Bearer ${unsignedJwt("authenticated")}`,
      serviceRoleKey: "svc",
    }),
    false,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: `Bearer ${unsignedJwt("publishable")}`,
      serviceRoleKey: "svc",
    }),
    false,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: "Bearer cron-secret",
      serviceRoleKey: "svc",
    }),
    false,
  );
});

type OutboxUpdate = { id: string; values: Record<string, unknown> };

function createOutboxClient(input: {
  pending: WebPushOutboxRow[];
  subscriptions?: WebPushSubscriptionRow[];
}): { client: WebPushServiceClient; limits: number[]; updates: OutboxUpdate[]; fromCalls: number } {
  const limits: number[] = [];
  const updates: OutboxUpdate[] = [];
  let fromCalls = 0;
  const client: WebPushServiceClient = {
    from(table: string) {
      fromCalls += 1;
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        limit(count: number) {
          limits.push(count);
          return Promise.resolve({ data: table === "web_push_outbox" ? input.pending.slice(0, count) : [] });
        },
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              updates.push({ id, values });
              return Promise.resolve({ data: null });
            },
          };
        },
        delete() {
          return {
            eq() {
              return Promise.resolve({ data: null });
            },
          };
        },
        then(resolve: (value: { data: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
          const data = table === "web_push_subscriptions" ? (input.subscriptions ?? []) : [];
          return Promise.resolve({ data }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  return { client, limits, updates, get fromCalls() { return fromCalls; } };
}

Deno.test("drain processes leftover pending rows with VAPID and limit 50", async () => {
  const pending: WebPushOutboxRow[] = [
    { id: "1", business_id: "b1", event_type: "appointment.created", title: "Nuevo turno", body: "Ana" },
    { id: "2", business_id: "b1", event_type: "appointment.created", title: "Nuevo turno", body: "Luis" },
  ];
  const { client, limits, updates } = createOutboxClient({ pending, subscriptions: [] });
  const result = await processWebPushOutbox({
    supabase: client,
    env: { VAPID_PRIVATE_KEY: "k", VAPID_PUBLIC_KEY: "p" },
    send: async () => {},
  });
  assertEquals(result, { processed: 2 });
  assertEquals(limits, [50]);
  assertEquals(updates.map((update) => update.values.status), ["skipped", "skipped"]);
  assertEquals(updates.map((update) => update.values.error), ["no_subscriptions", "no_subscriptions"]);
});

Deno.test("missing VAPID returns skipped missing_vapid and leaves pending rows", async () => {
  const pending: WebPushOutboxRow[] = [
    { id: "1", business_id: "b1", event_type: "appointment.created", title: "t", body: "b" },
  ];
  const mock = createOutboxClient({ pending });
  const result = await processWebPushOutbox({
    supabase: mock.client,
    env: { VAPID_PRIVATE_KEY: "", VAPID_PUBLIC_KEY: "p" },
  });
  assertEquals(result, { skipped: "missing_vapid" });
  assertEquals(mock.fromCalls, 0);
  assertEquals(mock.updates, []);
});

Deno.test("zero subscription tally marks skipped no_subscriptions, not sent", async () => {
  const pending: WebPushOutboxRow[] = [
    { id: "row-1", business_id: "b1", event_type: "appointment.created", title: "t", body: "b" },
  ];
  const { client, updates } = createOutboxClient({ pending, subscriptions: [] });
  await processWebPushOutbox({
    supabase: client,
    env: { VAPID_PRIVATE_KEY: "k", VAPID_PUBLIC_KEY: "p" },
    send: async () => {},
  });
  assertEquals(updates.length, 1);
  assertEquals(updates[0].values.status, "skipped");
  assertEquals(updates[0].values.error, "no_subscriptions");
});

Deno.test("unprivileged invocations 401 before processWebPushOutbox and CRON_KEY is not Authorization", async () => {
  const index = await Deno.readTextFile(new URL("../process-web-push-outbox/index.ts", import.meta.url));
  const helperCall = index.indexOf("isPrivilegedWebPushAuthorization");
  const unauthorized = index.indexOf('error: "UNAUTHORIZED"');
  const processCall = index.lastIndexOf("processWebPushOutbox(");
  assertEquals(helperCall >= 0, true);
  assertEquals(unauthorized >= 0, true);
  assertEquals(index.includes("status: 401"), true);
  assertEquals(processCall > unauthorized, true);
  assertEquals(/CRON_KEY|x-cron-key/.test(index), false);
  assertEquals(index.includes("status: 200"), true);
});

Deno.test("process-web-push-outbox gateway verify_jwt is true with service_role drain comment", async () => {
  const config = await Deno.readTextFile(new URL("../../config.toml", import.meta.url));
  assertMatch(config, /\[functions\.process-web-push-outbox\]\s*\nverify_jwt\s*=\s*true/);
  assertMatch(config, /Authorization: Bearer \$SERVICE_ROLE_KEY/);
});
