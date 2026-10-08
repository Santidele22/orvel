import { assert, assertEquals } from "std/assert/mod.ts";

import {
  getSessionHandoffAllowedOrigins,
  getSessionHandoffCorsHeaders,
  rejectDisallowedSessionHandoffOrigin,
} from "./session-handoff-cors.ts";

/**
 * ADR 0012 — one origin per artifact, so the handoff allowlist has to know all three per
 * environment instead of one shared origin.
 *
 * The bug this file exists to prevent: `ENVIRONMENT` was only consulted to decide whether to *add*
 * the localhost origins, and nothing in the repository ever set it. Every deployed function that
 * never set it therefore allowed six localhost origins, production included.
 */

const ORIGIN_ENV_KEYS = ["ENVIRONMENT", "DENO_ENV", "SESSION_HANDOFF_ALLOWED_ORIGINS", "APP_BASE_URL", "PUBLIC_SITE_URL"];

function withEnvironment<T>(env: Record<string, string>, body: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of ORIGIN_ENV_KEYS) {
    previous.set(key, Deno.env.get(key));
    if (key in env) Deno.env.set(key, env[key]);
    else Deno.env.delete(key);
  }

  try {
    return body();
  } finally {
    for (const key of ORIGIN_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function localhostOrigins(origins: string[]): string[] {
  return origins.filter((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"));
}

Deno.test("production allows the three artifact origins plus www, and no localhost", () => {
  withEnvironment({ ENVIRONMENT: "production" }, () => {
    const origins = getSessionHandoffAllowedOrigins();

    assert(origins.includes("https://orvel.pro"));
    assert(origins.includes("https://www.orvel.pro"));
    assert(origins.includes("https://app.orvel.pro"));
    assert(origins.includes("https://dashboard.orvel.pro"));
    assertEquals(localhostOrigins(origins), []);
  });
});

Deno.test("the retired qa environment resolves production origins and never localhost", () => {
  // #1133 deleted the pre-release environment. If a deployment still declares ENVIRONMENT=qa, it
  // must not resurrect the qa origins or fall back to the localhost allowlist.
  withEnvironment({ ENVIRONMENT: "qa" }, () => {
    const origins = getSessionHandoffAllowedOrigins();

    assert(origins.includes("https://orvel.pro"));
    assert(origins.includes("https://dashboard.orvel.pro"));
    assertEquals(origins.filter((origin) => origin.includes("qa")), []);
    assertEquals(localhostOrigins(origins), []);
  });
});

Deno.test("an unset environment means the local stack, which keeps the localhost origins", () => {
  withEnvironment({}, () => {
    const origins = getSessionHandoffAllowedOrigins();

    assert(origins.includes("http://localhost:3000"));
    assert(origins.includes("http://127.0.0.1:4321"));
  });
});

Deno.test("an unknown deployed environment fails safe: no localhost origins", () => {
  withEnvironment({ ENVIRONMENT: "staging" }, () => {
    assertEquals(localhostOrigins(getSessionHandoffAllowedOrigins()), []);
  });
});

Deno.test("configured and base-url origins are still merged in", () => {
  withEnvironment(
    {
      ENVIRONMENT: "production",
      SESSION_HANDOFF_ALLOWED_ORIGINS: "https://extra.example, https://otro.example",
      APP_BASE_URL: "https://app-base.example/",
    },
    () => {
      const origins = getSessionHandoffAllowedOrigins();

      assert(origins.includes("https://extra.example"));
      assert(origins.includes("https://otro.example"));
      // Trailing slashes are normalised away.
      assert(origins.includes("https://app-base.example"));
    },
  );
});

Deno.test("a disallowed origin gets a 403 and an allowed one does not", () => {
  withEnvironment({ ENVIRONMENT: "production" }, () => {
    const request = (origin: string) =>
      new Request("https://example.supabase.co/functions/v1/create-session-handoff", {
        method: "POST",
        headers: { origin },
      });

    assertEquals(rejectDisallowedSessionHandoffOrigin(request("https://orvel.pro")), null);
    assertEquals(rejectDisallowedSessionHandoffOrigin(request("https://app.orvel.pro")), null);

    const rejected = rejectDisallowedSessionHandoffOrigin(request("https://evil.example"));
    assert(rejected instanceof Response);
    assertEquals(rejected.status, 403);
  });
});

Deno.test("CORS echoes only an allowed origin and always varies on Origin", () => {
  withEnvironment({ ENVIRONMENT: "production" }, () => {
    const allowed = getSessionHandoffCorsHeaders(
      new Request("https://example.supabase.co/functions/v1/redeem-session-handoff", {
        method: "POST",
        headers: { origin: "https://dashboard.orvel.pro" },
      }),
    );
    assertEquals(allowed["Access-Control-Allow-Origin"], "https://dashboard.orvel.pro");
    assertEquals(allowed["Vary"], "Origin");

    const denied = getSessionHandoffCorsHeaders(
      new Request("https://example.supabase.co/functions/v1/redeem-session-handoff", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    assertEquals(denied["Access-Control-Allow-Origin"], undefined);
  });
});
