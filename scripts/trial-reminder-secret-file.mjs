const expectedNames = new Set([
  "TRIAL_REMINDER_RECIPIENT_EMAIL",
  "TRIAL_REMINDER_BUSINESS_NAME",
  "TRIAL_REMINDER_DASHBOARD_URL",
  "TRIAL_REMINDER_BOOKING_URL",
]);

export function validateSecretFile(content) {
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  const lines = normalized.split("\n");
  if (lines.length !== expectedNames.size) throw new Error("invalid temporary secret file");

  const values = new Map();
  for (const line of lines) {
    const match = /^(TRIAL_REMINDER_[A-Z_]+)=([^\r\n]+)$/.exec(line);
    if (!match || !expectedNames.has(match[1]) || values.has(match[1])) {
      throw new Error("invalid temporary secret file");
    }
    values.set(match[1], match[2]);
  }

  const recipient = values.get("TRIAL_REMINDER_RECIPIENT_EMAIL");
  const businessName = values.get("TRIAL_REMINDER_BUSINESS_NAME")?.trim();
  const urls = [values.get("TRIAL_REMINDER_DASHBOARD_URL"), values.get("TRIAL_REMINDER_BOOKING_URL")];
  let urlsAreSafe = true;
  try {
    urlsAreSafe = urls.every((value) => {
      const url = new URL(value ?? "");
      return url.protocol === "https:" && !url.username && !url.password;
    });
  } catch {
    urlsAreSafe = false;
  }
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || !businessName || !urlsAreSafe) {
    throw new Error("invalid temporary secret file");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile } = await import("node:fs/promises");
  try {
    const path = process.argv[2];
    if (!path) process.exit(2);
    validateSecretFile(await readFile(path, "utf8"));
  } catch {
    process.stderr.write("temporary_secret_file_invalid\n");
    process.exit(1);
  }
}
