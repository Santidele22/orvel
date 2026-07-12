import assert from "node:assert/strict";
import test from "node:test";
import { validateSecretFile } from "./trial-reminder-secret-file.mjs";

const valid = "TRIAL_REMINDER_RECIPIENT_EMAIL=synthetic@example.invalid\nTRIAL_REMINDER_BUSINESS_NAME=Synthetic Business\nTRIAL_REMINDER_DASHBOARD_URL=https://example.invalid/settings\nTRIAL_REMINDER_BOOKING_URL=https://booking.example.invalid/opaque\n";

test("accepts exactly the approved recipient and business identity assignments", () => {
  assert.doesNotThrow(() => validateSecretFile(valid));
});

test("rejects extras, duplicates, malformed syntax, and invalid values", () => {
  for (const content of [
    `${valid}TRIAL_REMINDER_EXTRA=value\n`,
    `${valid}TRIAL_REMINDER_RECIPIENT_EMAIL=other@example.invalid\n`,
    `${valid}\n`,
    `# comment\n${valid}`,
    valid.replace("TRIAL_REMINDER_RECIPIENT_EMAIL=", "export TRIAL_REMINDER_RECIPIENT_EMAIL="),
    valid.replace("=synthetic@example.invalid", " synthetic@example.invalid"),
    valid.replace("synthetic@example.invalid", "not-an-email"),
    valid.replace("https://example.invalid/settings", "javascript:alert(1)"),
  ]) assert.throws(() => validateSecretFile(content), /invalid temporary secret file/);
});
