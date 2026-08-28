import { assert, assertEquals, assertMatch, assertStringIncludes } from "std/assert/mod.ts";
import { createEmailFailoverSender } from "./email-provider-failover.ts";
import { renderTrialUserActivationReminder } from "./templates/business-templates.ts";
import {
  createMailtrapSender,
  handleProductionRequest,
  handleTrialUserActivationReminder,
  type TrialReminderDependencies,
} from "../send-trial-user-activation-reminder-once/index.ts";

const serviceKey = "test-service-role-key";
const recipient = "trial-recipient@example.invalid";
const reminderData = {
  recipientEmail: recipient,
  businessName: "Synthetic Business",
  dashboardUrl: "https://example.invalid/settings",
  bookingUrl: "https://booking.example.invalid/opaque",
};

function request(body?: string, authorization = `Bearer ${serviceKey}`) {
  return new Request("http://local.test/reminder", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body,
  });
}

function dependencies(
  reserve: TrialReminderDependencies["reserve"] = () => Promise.resolve("reserved"),
) {
  const calls: string[] = [];
  const deps: TrialReminderDependencies = {
    reserve: async () => {
      calls.push("reserve");
      return await reserve();
    },
    finalize: async (state) => {
      calls.push(`finalize:${state}`);
      return true;
    },
    send: async (message) => {
      calls.push(`send:${message.to}`);
      return "sent";
    },
  };
  return { calls, deps };
}

Deno.test("renders the immutable personal es-AR reminder", () => {
  const message = renderTrialUserActivationReminder(reminderData);
  assertEquals(message.to, recipient);
  assertEquals(message.subject, "Tu turnero de Orvel ya está listo");
  assertStringIncludes(message.html, "Gracias por confiar en Orvel");
  assertStringIncludes(message.html, "Configurar mis horarios");
  assertStringIncludes(message.html, reminderData.businessName);
  assertStringIncludes(message.html, reminderData.dashboardUrl);
  assertStringIncludes(message.html, reminderData.bookingUrl);
  assertEquals((message.html.match(/<a /g) ?? []).length, 1);
});

Deno.test("rejects unauthorized and caller-controlled requests before reservation", async () => {
  for (const candidate of [
    request("{}", "Bearer wrong-key"),
    request(JSON.stringify({ to: "attacker@example.com" })),
  ]) {
    const { calls, deps } = dependencies();
    const response = await handleTrialUserActivationReminder(candidate, deps, serviceKey, reminderData);
    assert([400, 403].includes(response.status));
    assertEquals(calls, []);
  }
});

Deno.test("requires gateway JWT verification and an exact configured service key", async () => {
  const config = await Deno.readTextFile(new URL("../../config.toml", import.meta.url));
  assertMatch(config, /\[functions\.send-trial-user-activation-reminder-once\]\s*verify_jwt = true/);
  const { calls, deps } = dependencies();
  const response = await handleTrialUserActivationReminder(request(), deps, undefined, reminderData);
  assertEquals(response.status, 403);
  assertEquals(calls, []);
});

Deno.test("reserves before one provider call and persists sent", async () => {
  const { calls, deps } = dependencies();
  const response = await handleTrialUserActivationReminder(request("{}"), deps, serviceKey, reminderData);
  assertEquals(response.status, 200);
  assertEquals(calls, ["reserve", `send:${recipient}`, "finalize:sent"]);
  assertEquals(await response.json(), { state: "sent" });
});

Deno.test("outer production entry rejects method and authorization before runtime config", async () => {
  const missingEnvironment = { get: () => undefined };
  const methodResponse = await handleProductionRequest(new Request("http://local.test", { method: "GET" }), missingEnvironment);
  assertEquals(methodResponse.status, 405);
  const authResponse = await handleProductionRequest(request(), missingEnvironment);
  assertEquals(authResponse.status, 403);
});

Deno.test("outer entry rejects incomplete deployment-only reminder content", async () => {
  const values = new Map([
    ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
    ["TRIAL_REMINDER_RECIPIENT_EMAIL", recipient],
    ["TRIAL_REMINDER_BUSINESS_NAME", "Synthetic Business"],
  ]);
  const response = await handleProductionRequest(request(), { get: (name) => values.get(name) });
  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "runtime_config_missing" });
});

Deno.test("Mailtrap adapter fixes endpoint, sender, message and one-fetch outcomes", async () => {
  const message = renderTrialUserActivationReminder(reminderData);
  for (const [status, expected] of [[200, "sent"], [422, "rejected"]] as const) {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const sender = createMailtrapSender(
      { apiToken: "test-token", fromEmail: "sender@orvel.test", fromName: "Orvel" },
      (input, init) => {
        calls.push({ input, init });
        return Promise.resolve(new Response("", { status }));
      },
    );
    const { calls: lifecycleCalls, deps } = dependencies();
    deps.send = sender;
    const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
    assertEquals(await response.json(), { state: expected });
    assertEquals(lifecycleCalls, ["reserve", `finalize:${expected}`]);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].input, "https://send.api.mailtrap.io/api/send");
    const payload = JSON.parse(String(calls[0].init?.body));
    assertEquals(payload.from, { email: "sender@orvel.test", name: "Orvel" });
    assertEquals(payload.to, [{ email: recipient }]);
    assertEquals(payload.subject, message.subject);
    assertEquals(payload.html, message.html);
  }

  let attempts = 0;
  const timeoutSender = createMailtrapSender(
    { apiToken: "test-token", fromEmail: "sender@orvel.test", fromName: "Orvel" },
    () => {
      attempts += 1;
      throw new TypeError("timeout");
    },
  );
  const { calls, deps } = dependencies();
  deps.send = timeoutSender;
  const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
  assertEquals(await response.json(), { state: "ambiguous" });
  assertEquals(attempts, 1);
  assertEquals(calls, ["reserve", "finalize:ambiguous"]);

  let finalizationFetches = 0;
  const acceptedSender = createMailtrapSender(
    { apiToken: "test-token", fromEmail: "sender@orvel.test", fromName: "Orvel" },
    () => {
      finalizationFetches += 1;
      return Promise.resolve(new Response("", { status: 200 }));
    },
  );
  const finalization = dependencies();
  finalization.deps.send = acceptedSender;
  finalization.deps.finalize = async () => false;
  const failed = await handleTrialUserActivationReminder(request(), finalization.deps, serviceKey, reminderData);
  assertEquals(await failed.json(), { error: "outcome_persistence_failed", state: "reserved" });
  assertEquals(finalizationFetches, 1);
});

Deno.test("Mailtrap adapter bounds provider time and never retries after abort", async () => {
  let fetches = 0;
  const sender = createMailtrapSender(
    { apiToken: "test-token", fromEmail: "sender@orvel.test", fromName: "Orvel", timeoutMs: 5 },
    (_input, init) => {
      fetches += 1;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    },
  );
  const { calls, deps } = dependencies();
  deps.send = sender;
  const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
  assertEquals(await response.json(), { state: "ambiguous" });
  assertEquals(calls, ["reserve", "finalize:ambiguous"]);
  assertEquals(fetches, 1);
});

Deno.test("production failover sender: 429/throw recover, both-throw stays ambiguous", async () => {
  const source = await Deno.readTextFile(new URL("../send-trial-user-activation-reminder-once/index.ts", import.meta.url));
  assertStringIncludes(source, "createEmailFailoverSender");
  assertEquals(source.includes('requiredEnvironment(environment, "MAILTRAP_API_TOKEN")'), false);

  const bothEnv = {
    get: (name: string) => ({ MAILTRAP_API_TOKEN: "mt", RESEND_API_KEY: "re", RESEND_FROM_EMAIL: "noreply@orvel.app" }[name]),
  };
  const urls: string[] = [];
  const quota = dependencies();
  quota.deps.send = createEmailFailoverSender(bothEnv, (input) => {
    urls.push(String(input));
    return Promise.resolve(new Response("", { status: String(input).includes("mailtrap") ? 429 : 200 }));
  });
  assertEquals(await (await handleTrialUserActivationReminder(request(), quota.deps, serviceKey, reminderData)).json(), { state: "sent" });
  assertEquals(quota.calls, ["reserve", "finalize:sent"]);
  assertEquals(urls, ["https://send.api.mailtrap.io/api/send", "https://api.resend.com/emails"]);

  const recovered = dependencies();
  recovered.deps.send = createEmailFailoverSender(bothEnv, (input) =>
    String(input).includes("mailtrap") ? Promise.reject(new TypeError("timeout")) : Promise.resolve(new Response("", { status: 200 }))
  );
  assertEquals(await (await handleTrialUserActivationReminder(request(), recovered.deps, serviceKey, reminderData)).json(), { state: "sent" });

  const ambiguous = dependencies();
  ambiguous.deps.send = createEmailFailoverSender(bothEnv, () => Promise.reject(new TypeError("timeout")));
  assertEquals(await (await handleTrialUserActivationReminder(request(), ambiguous.deps, serviceKey, reminderData)).json(), { state: "ambiguous" });
  assertEquals(ambiguous.calls, ["reserve", "finalize:ambiguous"]);
});

Deno.test("already-consumed attempts never call the provider", async () => {
  const { calls, deps } = dependencies(() => Promise.resolve("already_consumed"));
  const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
  assertEquals(response.status, 409);
  assertEquals(calls, ["reserve"]);
  assertEquals(await response.json(), { state: "already_consumed" });
});

Deno.test("persists rejected and ambiguous outcomes without retry", async () => {
  for (const [providerResult, expected] of [["rejected", "rejected"], ["ambiguous", "ambiguous"]] as const) {
    const { calls, deps } = dependencies();
    deps.send = async () => {
      calls.push("send");
      return providerResult;
    };
    const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
    assertEquals(await response.json(), { state: expected });
    assertEquals(calls, ["reserve", "send", `finalize:${expected}`]);
  }

  const { calls, deps } = dependencies();
  deps.send = () => {
    calls.push("send");
    throw new Error("timeout");
  };
  const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
  assertEquals(await response.json(), { state: "ambiguous" });
  assertEquals(calls, ["reserve", "send", "finalize:ambiguous"]);
});

Deno.test("never fabricates an outcome when finalization fails", async () => {
  for (const finalize of [async () => false, async () => { throw new Error("db unavailable"); }]) {
    const { calls, deps } = dependencies();
    deps.finalize = finalize;
    const response = await handleTrialUserActivationReminder(request(), deps, serviceKey, reminderData);
    assertEquals(response.status, 500);
    assertEquals(await response.json(), { error: "outcome_persistence_failed", state: "reserved" });
    assertEquals(calls.filter((call) => call.startsWith("send")).length, 1);
  }
});
