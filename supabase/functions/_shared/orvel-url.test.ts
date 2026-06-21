import { assertEquals } from "std/assert/assert_equals.ts";

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
  const configuredUrl = "https://orvel.pro/dashboard";

  assertEquals(
    buildDashboardUrl("billing/success", configuredUrl),
    "https://orvel.pro/dashboard/billing/success",
  );
  assertEquals(
    buildAppUrl("auth/signup/credentials?plan=STARTER", configuredUrl),
    "https://orvel.pro/auth/signup/credentials?plan=STARTER",
  );
});
