const functionName = "send-trial-user-activation-reminder-once";

export async function safePreflight({ projectRef, fetcher, timeoutMs = 15_000 }) {
  let calls = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    calls += 1;
    const response = await fetcher(
      `https://${projectRef}.supabase.co/functions/v1/${functionName}`,
      { method: "GET", signal: controller.signal },
    );
    if (calls !== 1 || response.status !== 405) throw new Error("safe preflight failed");
    return { status: 405 };
  } catch {
    throw new Error("safe preflight failed");
  } finally {
    clearTimeout(timer);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const projectRef = process.argv[2];
  if (!projectRef) process.exit(2);
  try {
    await safePreflight({ projectRef, fetcher: fetch });
    process.stdout.write("safe_preflight_status=405\n");
  } catch {
    process.stderr.write("safe_preflight_failed\n");
    process.exit(1);
  }
}
