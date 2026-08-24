import { assert, assertEquals, assertMatch, assertStringIncludes } from "std/assert/mod.ts";

const functionUrl = new URL("./index.ts", import.meta.url);
const configUrl = new URL("../../config.toml", import.meta.url);
const templatesUrl = new URL("../_shared/templates/business-templates.ts", import.meta.url);
const outboxUrl = new URL("../process-email-outbox/index.ts", import.meta.url);
const reminders24hUrl = new URL("../appointment-reminders-24h/index.ts", import.meta.url);
const migrationsDir = new URL("../../migrations/", import.meta.url);

async function reminderMigrationSql(): Promise<string> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (entry.isFile && entry.name.endsWith(".sql") && entry.name.includes("signup_confirm_reminder")) {
      names.push(entry.name);
    }
  }
  names.sort();
  const fileName = names.at(-1);
  assert(fileName, "expected a *_signup_confirm_reminder.sql migration");
  return await Deno.readTextFile(new URL(fileName, migrationsDir));
}

Deno.test("48h reminder RPC inserts only when email_confirmed_at is null and keeps a unique lifecycle key", async () => {
  const sql = await reminderMigrationSql();

  assertMatch(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.enqueue_signup_email_verification_actions\s*\(\s*\)/i);
  assertMatch(sql, /email_confirmed_at\s+IS\s+NULL/i);
  assertMatch(sql, /dashboard_ready_at\s*<=\s*now\(\)\s*-\s*interval\s+'48 hours'/i);
  assertMatch(sql, /'signup_email_confirmation_reminder'/);
  assertMatch(sql, /'signup-confirm-reminder:'\s*\|\|/);
  assertMatch(sql, /ON\s+CONFLICT\s*\(\s*lifecycle_event_key\s*\)[\s\S]*DO\s+NOTHING/i);
  assertEquals(/email_confirmed_at\s+IS\s+NOT\s+NULL[\s\S]{0,200}signup_email_confirmation_reminder/i.test(sql), false);
});

Deno.test("lifecycle cron function authenticates with CRON_KEY like appointment-reminders-24h and calls the enqueue RPC", async () => {
  const source = await Deno.readTextFile(functionUrl);
  const reminderCron = await Deno.readTextFile(reminders24hUrl);
  const config = await Deno.readTextFile(configUrl);

  assertStringIncludes(source, 'Deno.env.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("CRON_KEY")');
  assertStringIncludes(source, 'req.headers.get("x-cron-key")');
  assertStringIncludes(source, 'enqueue_signup_email_verification_actions');
  assertEquals(/RESEND_FROM_EMAIL/.test(source), false);
  assertStringIncludes(reminderCron, 'Deno.env.get("CRON_KEY")');
  assertStringIncludes(config, "[functions.signup-email-verification-lifecycle]");
  assertMatch(config, /\[functions\.signup-email-verification-lifecycle\]\s*\nverify_jwt\s*=\s*false/);
});

Deno.test("outbox gains a reminder template branch only and confirmation copy says the account is already live", async () => {
  const templates = await Deno.readTextFile(templatesUrl);
  const outbox = await Deno.readTextFile(outboxUrl);
  const claimFn = outbox.match(/claim_notification_email_outbox_for_send[\s\S]{0,400}/)?.[0] ?? "";

  assertMatch(templates, /export\s+function\s+renderSignupEmailConfirmationReminder/);
  assertMatch(templates, /renderSignupEmailConfirmation[\s\S]{0,800}ya est[aá] (activa|lista|en vivo|disponible)|cuenta ya/i);
  assertMatch(outbox, /template_key\s*===\s*["']signup_email_confirmation_reminder["']/);
  assertMatch(outbox, /renderSignupEmailConfirmationReminder/);
  assertEquals(/RESEND_FROM_EMAIL\s*=/.test(outbox), false);
  assertStringIncludes(claimFn, "claim_notification_email_outbox_for_send");
});
