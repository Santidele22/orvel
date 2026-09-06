import { assertEquals, assertRejects } from "std/assert/mod.ts";
import { sendEmailWithFailover } from "./email-provider-failover.ts";

const MT = "https://send.api.mailtrap.io/api/send";
const RS = "https://api.resend.com/emails";
const MT_SECRET = "mt_test_secret_do_not_leak";
const RS_SECRET = "re_test_secret_do_not_leak";
const message = { to: "user@example.test", subject: "Hello", html: "<p>Hi</p>" };
const env = (values: Record<string, string | undefined>) => ({ get: (name: string) => values[name] });
const both = env({ MAILTRAP_API_TOKEN: MT_SECRET, RESEND_API_KEY: RS_SECRET, RESEND_FROM_EMAIL: "noreply@orvel.app" });

function noSecrets(value: unknown) {
  const text = JSON.stringify(value);
  assertEquals(text.includes(MT_SECRET) || text.includes(RS_SECRET), false);
}

Deno.test("email provider failover cases", async () => {
  const run = async (handler: (url: string) => number | Error, values = both) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await sendEmailWithFailover(values, message, (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      const next = handler(url);
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(new Response("", { status: next }));
    });
    noSecrets(result);
    return { result, calls };
  };

  let { result, calls } = await run((url) => url === MT ? 200 : 500);
  assertEquals(result, { ok: true, provider: "mailtrap" });
  assertEquals(calls.map((call) => call.url), [MT]);
  assertEquals(JSON.parse(String(calls[0].init?.body)).from, { email: "no-reply@orvel.test", name: "Orvel" });

  ({ result, calls } = await run((url) => url === MT ? 429 : 200));
  assertEquals(result, { ok: true, provider: "resend" });
  assertEquals(calls.map((call) => call.url), [MT, RS]);

  ({ result, calls } = await run((url) => url === MT ? 400 : 200));
  assertEquals(result, { ok: false, error: "email_provider_error" });
  assertEquals(calls.map((call) => call.url), [MT]);

  ({ result, calls } = await run(() => 500));
  assertEquals(result, { ok: false, error: "email_provider_error" });
  assertEquals(calls.map((call) => call.url), [MT, RS]);

  ({ result, calls } = await run((url) => url === RS ? 200 : 500, env({ RESEND_API_KEY: RS_SECRET, RESEND_FROM_EMAIL: "noreply@orvel.app" })));
  assertEquals(result, { ok: true, provider: "resend" });
  assertEquals(JSON.parse(String(calls[0].init?.body)).from, "Orvel <noreply@orvel.app>");
  assertEquals(JSON.parse(String(calls[0].init?.body)).to, [message.to]);

  ({ result, calls } = await run(() => 200, env({})));
  assertEquals(result, { ok: false, error: "email_provider_config_missing" });
  assertEquals(calls.length, 0);

  noSecrets((await run(() => 502)).result);
  const error = await assertRejects(() =>
    sendEmailWithFailover(both, message, () => Promise.reject(new Error(`timeout ${MT_SECRET} ${RS_SECRET}`)))
  );
  noSecrets(String(error));
  noSecrets((error as Error).message);
});
