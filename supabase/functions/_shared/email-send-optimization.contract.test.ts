import { assertMatch, assertStringIncludes } from "std/assert/mod.ts";

const migrationUrl = new URL(
  "../../migrations/20260829180000_reminder_operator_push_and_premium_activated.sql",
  import.meta.url,
);
const templatesUrl = new URL("./templates/business-templates.ts", import.meta.url);
const outboxUrl = new URL("../process-email-outbox/index.ts", import.meta.url);

Deno.test("reminder enqueue keeps customer email and adds operator notification", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const reminderFn = sql.match(
    /CREATE OR REPLACE FUNCTION public\.enqueue_appointment_reminders_24h\([\s\S]*?\$\$;/,
  )?.[0] ?? "";
  assertMatch(reminderFn, /template_key = 'appointment_reminder_24h'/);
  assertMatch(reminderFn, /r\.customer_email/);
  assertMatch(reminderFn, /INSERT INTO public\.dashboard_notifications/);
  assertMatch(reminderFn, /'appointment\.reminder'/);
  assertMatch(sql, /'appointment\.reminder'/);
  assertMatch(sql, /enqueue_web_push_outbox/);
  const helper = await Deno.readTextFile(new URL("./process-web-push-outbox.ts", import.meta.url));
  assertMatch(helper, /appointment\.reminder/);
});

Deno.test("premium activation email is enqueued on plan_code update and rendered by outbox", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  const templates = await Deno.readTextFile(templatesUrl);
  const outbox = await Deno.readTextFile(outboxUrl);
  assertMatch(sql, /template_key = 'premium_activated'/);
  assertMatch(sql, /AFTER UPDATE OF plan_code ON public\.business_subscriptions/);
  assertMatch(templates, /export function renderPremiumActivatedEmail/);
  assertStringIncludes(outbox, 'template_key === "premium_activated"');
  assertStringIncludes(outbox, "renderPremiumActivatedEmail");
});
