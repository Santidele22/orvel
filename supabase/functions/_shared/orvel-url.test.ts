import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";

import {
  buildAppUrl,
  buildDashboardUrl,
  resolveAppOrigin,
} from "./orvel-url.ts";

Deno.test("resolveAppOrigin defaults to the single Orvel domain", () => {
  assertEquals(resolveAppOrigin(undefined), "https://orvel.pro");
});

Deno.test("resolveAppOrigin maps legacy dashboard subdomain to single-domain origin", () => {
  assertEquals(
    resolveAppOrigin("https://dashboard.orvel.pro"),
    "https://orvel.pro",
  );
  assertEquals(
    resolveAppOrigin("https://dashboard.orvel.pro/dashboard"),
    "https://orvel.pro",
  );
});

Deno.test("resolveAppOrigin strips dashboard paths to avoid double dashboard segments", () => {
  assertEquals(
    resolveAppOrigin("https://orvel.pro/dashboard"),
    "https://orvel.pro",
  );
  assertEquals(
    resolveAppOrigin("http://localhost:4200/dashboard"),
    "http://localhost:4200",
  );
});

Deno.test("buildDashboardUrl avoids double dashboard segments", () => {
  const previousFrontendUrl = Deno.env.get("FRONTEND_URL");
  const previousAppBaseUrl = Deno.env.get("APP_BASE_URL");

  try {
    Deno.env.set("FRONTEND_URL", "https://orvel.pro/dashboard");
    Deno.env.delete("APP_BASE_URL");

    assertEquals(
      buildDashboardUrl("billing/success"),
      "https://orvel.pro/dashboard/billing/success",
    );
    assertEquals(
      buildAppUrl("auth/signup/credentials?plan=STARTER"),
      "https://orvel.pro/auth/signup/credentials?plan=STARTER",
    );
  } finally {
    if (previousFrontendUrl === undefined) Deno.env.delete("FRONTEND_URL");
    else Deno.env.set("FRONTEND_URL", previousFrontendUrl);

    if (previousAppBaseUrl === undefined) Deno.env.delete("APP_BASE_URL");
    else Deno.env.set("APP_BASE_URL", previousAppBaseUrl);
  }
});
