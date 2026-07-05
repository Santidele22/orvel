import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";

import { formatArgentinaAppointmentDate, renderAppointmentReminder24hEmail } from "./templates/appointment-templates.ts";
import { appointmentTimeLabel, normalizeAppointmentTemplateData } from "./process-email-outbox-helpers.ts";

Deno.test("appointment lifecycle email dates render in Argentina business timezone", () => {
  const utcTimestamp = "2026-01-01T02:30:00.000Z";

  assertEquals(formatArgentinaAppointmentDate(utcTimestamp), "31/12/2025");
  assertEquals(appointmentTimeLabel(utcTimestamp, null), "23:30");
});

Deno.test("appointment lifecycle template renders deterministic Argentina-local date and time", () => {
  const utcTimestamp = "2026-07-04T15:45:00.000Z";
  const data = normalizeAppointmentTemplateData({
    customer: { name: "Cliente", email: "cliente@example.test" },
    business: { name: "Orvel", address: "Buenos Aires" },
    service: { name: "Corte" },
    date: utcTimestamp,
    duration: 45,
    price: 12000,
    contact: { phone: "No especificado", email: "soporte@example.test" },
  }, "cliente@example.test", "no-reply@example.test", "https://orvel.pro");

  const rendered = renderAppointmentReminder24hEmail(data).html;

  assertStringIncludes(rendered, "<strong>Fecha:</strong> 04/07/2026");
  assertStringIncludes(rendered, "<strong>Horario:</strong> 12:45");
});
