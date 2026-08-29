import { assertEquals } from "jsr:@std/assert";

import {
  buildOperatorWebPushPayload,
  isOperatorWebPushEventType,
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

Deno.test("appointment inbox event types include reminder for operator push", () => {
  assertEquals(isOperatorWebPushEventType("appointment.created"), true);
  assertEquals(isOperatorWebPushEventType("appointment.cancelled"), true);
  assertEquals(isOperatorWebPushEventType("appointment.rescheduled"), true);
  assertEquals(isOperatorWebPushEventType("appointment.reminder"), true);
  assertEquals(isOperatorWebPushEventType("system.welcome"), false);
});
