export const MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send";
export const RESEND_SEND_URL = "https://api.resend.com/emails";

export type EmailEnv = { get(name: string): string | undefined };
export type EmailProviderName = "mailtrap" | "resend";
export type EmailMessage = { to: string; subject: string; html: string };
export type EmailFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type SendEmailResult =
  | { ok: true; provider: EmailProviderName }
  | { ok: false; error: "email_provider_config_missing" | "email_provider_error" };

type Provider = { name: EmailProviderName; url: string; key: string; fromEmail: string; body: (message: EmailMessage) => unknown };
const trim = (env: EmailEnv, name: string) => env.get(name)?.trim() || "";

export function resolveEmailProviders(env: EmailEnv): Provider[] {
  const providers: Provider[] = [];
  const mailtrapKey = trim(env, "MAILTRAP_API_TOKEN") || trim(env, "MAILTRAP_TOKEN") || trim(env, "MAILTRAP_API_KEY");
  if (mailtrapKey) {
    const fromEmail = trim(env, "MAILTRAP_FROM_EMAIL") || "no-reply@orvel.test";
    const fromName = trim(env, "MAILTRAP_FROM_NAME") || "Orvel";
    providers.push({
      name: "mailtrap",
      url: MAILTRAP_SEND_URL,
      key: mailtrapKey,
      fromEmail,
      body: (message) => ({
        from: { email: fromEmail, name: fromName },
        to: [{ email: message.to }],
        subject: message.subject,
        html: message.html,
      }),
    });
  }

  const resendKey = trim(env, "RESEND_API_KEY");
  const resendFrom = trim(env, "RESEND_FROM_EMAIL");
  if (resendKey && resendFrom) {
    const fromName = trim(env, "RESEND_FROM_NAME") || "Orvel";
    const from = resendFrom.includes("<") ? resendFrom : `${fromName} <${resendFrom}>`;
    const fromEmail = /<([^>]+)>/.exec(from)?.[1] ?? resendFrom;
    providers.push({
      name: "resend",
      url: RESEND_SEND_URL,
      key: resendKey,
      fromEmail,
      body: (message) => ({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
    });
  }

  return providers;
}

export async function sendEmailWithFailover(
  env: EmailEnv,
  message: EmailMessage,
  fetcher: EmailFetcher = fetch,
): Promise<SendEmailResult> {
  const providers = resolveEmailProviders(env);
  if (!providers.length) return { ok: false, error: "email_provider_config_missing" };

  let networkFailures = 0;
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    const hasNext = index < providers.length - 1;
    try {
      const response = await fetcher(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(provider.body(message)),
      });
      if (response.ok) return { ok: true, provider: provider.name };
      await response.body?.cancel();
      if ((response.status === 429 || response.status >= 500) && hasNext) continue;
      return { ok: false, error: "email_provider_error" };
    } catch {
      networkFailures += 1;
      if (hasNext) continue;
    }
  }

  if (networkFailures === providers.length) throw new Error("email_provider_error");
  return { ok: false, error: "email_provider_error" };
}

export function createEmailFailoverSender(env: EmailEnv, fetcher: EmailFetcher) {
  return async (message: EmailMessage) => {
    const result = await sendEmailWithFailover(env, message, fetcher);
    if (result.ok) return "sent" as const;
    if (result.error === "email_provider_config_missing") throw new Error("runtime_config_missing");
    return "rejected" as const;
  };
}
