import { assertEquals } from "jsr:@std/assert";

import {
  buildOperatorWebPushPayload,
  isOperatorWebPushEventType,
  isPrivilegedWebPushAuthorization,
  shouldSkipWebPush,
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

function unsignedServiceRoleJwt(): string {
  const payload = btoa(JSON.stringify({ role: "service_role" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

Deno.test("authorizes database-webhook service_role JWT when the raw key does not match", () => {
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: `Bearer ${unsignedServiceRoleJwt()}`,
      cronKeyHeader: null,
      expectedCronKey: "cron",
      serviceRoleKey: "other-service-role-material",
    }),
    true,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: "Bearer not-a-jwt",
      cronKeyHeader: null,
      expectedCronKey: "cron",
      serviceRoleKey: "svc",
    }),
    false,
  );
  assertEquals(
    isPrivilegedWebPushAuthorization({
      authorizationHeader: null,
      cronKeyHeader: "cron",
      expectedCronKey: "cron",
      serviceRoleKey: "svc",
    }),
    true,
  );
});

Deno.test("appointment inbox event types include reminder for operator push", () => {
  assertEquals(isOperatorWebPushEventType("appointment.created"), true);
  assertEquals(isOperatorWebPushEventType("appointment.cancelled"), true);
  assertEquals(isOperatorWebPushEventType("appointment.rescheduled"), true);
  assertEquals(isOperatorWebPushEventType("appointment.reminder"), true);
  assertEquals(isOperatorWebPushEventType("system.welcome"), false);
});
