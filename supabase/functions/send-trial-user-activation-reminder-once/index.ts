import { createClient } from "@supabase/supabase-js";
import { createEmailFailoverSender, resolveEmailProviders } from "../_shared/email-provider-failover.ts";
import {
  renderTrialUserActivationReminder,
  type TrialUserActivationReminder,
  type TrialUserActivationReminderData,
} from "../_shared/templates/business-templates.ts";

const MAILTRAP_API_URL = "https://send.api.mailtrap.io/api/send";
type TerminalOutcome = "sent" | "rejected" | "ambiguous";
type Reservation = "reserved" | "already_consumed";
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface EnvironmentReader {
  get(name: string): string | undefined;
}

export interface TrialReminderDependencies {
  reserve(): Promise<Reservation>;
  finalize(state: TerminalOutcome): Promise<boolean>;
  send(message: TrialUserActivationReminder): Promise<TerminalOutcome>;
}

function json(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function bearer(header: string | null): string | null {
  return /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1]?.trim() || null;
}

function timingSafeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function authorized(request: Request, serviceRoleKey: string | undefined): boolean {
  const token = bearer(request.headers.get("authorization"));
  return Boolean(token && serviceRoleKey && timingSafeEqual(token, serviceRoleKey));
}

async function hasEmptyObjectBody(request: Request): Promise<boolean> {
  const raw = (await request.text()).trim();
  if (!raw) return true;
  try {
    const value = JSON.parse(raw);
    return value !== null && !Array.isArray(value) && typeof value === "object" && Object.keys(value).length === 0;
  } catch {
    return false;
  }
}

export async function handleTrialUserActivationReminder(
  request: Request,
  dependencies: TrialReminderDependencies,
  serviceRoleKey: string | undefined,
  reminderData: TrialUserActivationReminderData,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!authorized(request, serviceRoleKey)) return json({ error: "forbidden" }, 403);
  if (!await hasEmptyObjectBody(request)) return json({ error: "invalid_body" }, 400);

  let reservation: Reservation;
  try {
    reservation = await dependencies.reserve();
  } catch {
    return json({ error: "reservation_failed" }, 500);
  }
  if (reservation !== "reserved") return json({ state: "already_consumed" }, 409);

  let outcome: TerminalOutcome;
  try {
    outcome = await dependencies.send(renderTrialUserActivationReminder(reminderData));
  } catch {
    outcome = "ambiguous";
  }

  try {
    if (!await dependencies.finalize(outcome)) {
      return json({ error: "outcome_persistence_failed", state: "reserved" }, 500);
    }
  } catch {
    return json({ error: "outcome_persistence_failed", state: "reserved" }, 500);
  }

  return json({ state: outcome }, outcome === "sent" ? 200 : 502);
}

function requiredEnvironment(environment: EnvironmentReader, name: string): string {
  const value = environment.get(name)?.trim();
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

function requiredHttpsUrl(environment: EnvironmentReader, name: string): string {
  const value = requiredEnvironment(environment, name);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`${name}_INVALID`);
  return parsed.toString();
}

export function createMailtrapSender(
  config: { apiToken: string; fromEmail: string; fromName: string; timeoutMs?: number },
  fetcher: Fetcher,
): TrialReminderDependencies["send"] {
  return async (message) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
    try {
      const response = await fetcher(MAILTRAP_API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${config.apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: { email: config.fromEmail, name: config.fromName },
          to: [{ email: message.to }],
          subject: message.subject,
          html: message.html,
        }),
      });
      return response.ok ? "sent" : "rejected";
    } finally {
      clearTimeout(timeout);
    }
  };
}

function runtimeContext(environment: EnvironmentReader, fetcher: Fetcher) {
  const serviceKey = requiredEnvironment(environment, "SUPABASE_SERVICE_ROLE_KEY");
  const recipientEmail = requiredEnvironment(environment, "TRIAL_REMINDER_RECIPIENT_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    throw new Error("TRIAL_REMINDER_IDENTITY_INVALID");
  }
  const reminderData = {
    recipientEmail,
    businessName: requiredEnvironment(environment, "TRIAL_REMINDER_BUSINESS_NAME"),
    dashboardUrl: requiredHttpsUrl(environment, "TRIAL_REMINDER_DASHBOARD_URL"),
    bookingUrl: requiredHttpsUrl(environment, "TRIAL_REMINDER_BOOKING_URL"),
  };
  const supabase = createClient(requiredEnvironment(environment, "SUPABASE_URL"), serviceKey);
  if (!resolveEmailProviders(environment).length) throw new Error("runtime_config_missing");
  const dependencies: TrialReminderDependencies = {
    reserve: async () => {
      const { data, error } = await supabase.rpc("reserve_trial_user_activation_reminder_attempt");
      if (error || (data !== "reserved" && data !== "already_consumed")) throw new Error("RESERVATION_FAILED");
      return data;
    },
    finalize: async (state) => {
      const { data, error } = await supabase.rpc("finalize_trial_user_activation_reminder_attempt", { p_state: state });
      if (error) throw new Error("FINALIZATION_FAILED");
      return data === true;
    },
    send: createEmailFailoverSender(environment, fetcher),
  };
  return { dependencies, reminderData };
}

export async function handleProductionRequest(
  request: Request,
  environment: EnvironmentReader = Deno.env,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const serviceKey = environment.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!authorized(request, serviceKey)) return json({ error: "forbidden" }, 403);
  try {
    const { dependencies, reminderData } = runtimeContext(environment, fetcher);
    return await handleTrialUserActivationReminder(request, dependencies, serviceKey, reminderData);
  } catch {
    return json({ error: "runtime_config_missing" }, 500);
  }
}

if (import.meta.main) {
  Deno.serve((request) => handleProductionRequest(request));
}
