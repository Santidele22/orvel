import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION = new URL("../../migrations/20260626120000_default_services_by_business_type.sql", import.meta.url);
const HARDENING_MIGRATION = new URL("../../migrations/20260626224500_harden_default_service_provisioning.sql", import.meta.url);
const CONFIRM_EMAIL = new URL("../../../apps/landing/src/pages/api/signup/confirm-email.ts", import.meta.url);
const MP_WEBHOOK = new URL("../mercadopago-webhook/index.ts", import.meta.url);
const DASHBOARD_ONBOARDING = new URL("../../../apps/dashboard/src/app/features/onboarding/pages/signup-business-types-step.page.ts", import.meta.url);

async function readText(path: URL): Promise<string> {
  return Deno.readTextFile(path);
}

Deno.test("default service catalog is database-backed and keyed by rubro", async () => {
  const migration = await readText(MIGRATION);
  const hardeningMigration = await readText(HARDENING_MIGRATION);

  assertStringIncludes(migration, "CREATE TABLE IF NOT EXISTS public.business_type_default_services");
  assertStringIncludes(migration, "business_type_code text NOT NULL REFERENCES public.business_types(code)");
  assertStringIncludes(migration, "CREATE OR REPLACE FUNCTION public.provision_default_services_for_business");
  assert(migration.match(/'peluqueria'\s*,\s*'Peluquería'\s*,\s*'Corte mujer'/), "catalog must seed dashboard peluqueria suggestions");
  assert(migration.match(/'unas'\s*,\s*'Uñas'\s*,\s*'Manicura'/), "catalog must seed dashboard uñas suggestions");
  assert(migration.match(/'barberia'\s*,\s*'Barbería'\s*,\s*'Corte de cabello'/), "catalog must seed dashboard barbería suggestions");
  assert(hardeningMigration.match(/'estetica'\s*,\s*'Estética Facial'\s*,\s*'Limpieza facial'/), "landing-allowed estetica must have default services");
  assert(hardeningMigration.match(/'maquillaje'\s*,\s*'Maquillaje'\s*,\s*'Maquillaje social'/), "landing-allowed maquillaje must have default services");
});

Deno.test("landing-allowed rubros are covered by active DB catalog defaults", async () => {
  const confirmEmail = await readText(CONFIRM_EMAIL);
  const migration = await readText(MIGRATION);
  const hardeningMigration = await readText(HARDENING_MIGRATION);
  const allDefaultCatalogSql = `${migration}\n${hardeningMigration}`;
  const allowedTypesMatch = confirmEmail.match(/ALLOWED_BUSINESS_TYPES\s*=\s*new Set\(\[([^\]]+)\]\)/);
  assert(allowedTypesMatch, "landing allowed business types must remain statically auditable");

  const allowedTypes = [...allowedTypesMatch[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  for (const businessType of allowedTypes) {
    assert(
      new RegExp(`'${businessType}'\\s*,`).test(allDefaultCatalogSql),
      `landing-allowed rubro ${businessType} must be present in the DB default-service catalog`,
    );
  }
});

Deno.test("default service provisioning is idempotent at database level", async () => {
  const migration = await readText(MIGRATION);
  const provisionFunction = migration.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.provision_default_services_for_business[\s\S]*?\nEND;\n\$\$/i)?.[0] ?? "";

  assertStringIncludes(migration, "services_default_service_once_idx");
  assertStringIncludes(migration, "default_service_id uuid REFERENCES public.business_type_default_services");
  assert(provisionFunction.match(/SELECT\s+DISTINCT\s+ON\s*\(\s*lower\(btrim\(defaults\.name\)\)/i), "multi-rubro provisioning must dedupe equal catalog names/categories");
  assert(provisionFunction.match(/WHERE\s+NOT\s+EXISTS\s*\([\s\S]*existing\.business_id\s*=\s*p_business_id[\s\S]*lower\(btrim\(existing\.name\)\)/i), "provisioning must avoid duplicating existing business services by name/category");
  assertStringIncludes(provisionFunction, "ON CONFLICT DO NOTHING");
});

Deno.test("authenticated default service provisioning is constrained by stored selection and plan limits", async () => {
  const hardeningMigration = await readText(HARDENING_MIGRATION);
  const provisionFunction = hardeningMigration.match(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.provision_default_services_for_business[\s\S]*?\nEND;\n\$\$/i)?.[0] ?? "";

  assertStringIncludes(hardeningMigration, "ADD COLUMN IF NOT EXISTS selected_business_types text[] NOT NULL DEFAULT '{}'");
  assertStringIncludes(provisionFunction, "v_requested_count > v_max_rubros");
  assertStringIncludes(provisionFunction, "public.plan_business_types");
  assertStringIncludes(provisionFunction, "default service provisioning contains rubros not selected for business");
  assert(provisionFunction.match(/auth\.role\(\)\s*<>\s*'service_role'[\s\S]*v_selected_business_types/i), "authenticated callers must be checked against stored selected rubros");
});

Deno.test("signup materialization paths provision selected rubro defaults before success", async () => {
  const confirmEmail = await readText(CONFIRM_EMAIL);
  const mpWebhook = await readText(MP_WEBHOOK);
  const dashboardOnboarding = await readText(DASHBOARD_ONBOARDING);

  assert(confirmEmail.match(/rpc\(\s*["']provision_default_services_for_business["'][\s\S]*p_business_types:\s*selectedBusinessTypes/i), "FREE email confirmation must provision all selected rubros");
  assert(confirmEmail.match(/selected_business_types:\s*selectedBusinessTypes/i), "FREE email confirmation must persist selected rubros before provisioning");
  assert(confirmEmail.match(/defaultServicesError|defaultServicesProvisioned/i), "FREE email confirmation must fail closed when provisioning fails");
  assert(mpWebhook.match(/rpc\(\s*["']provision_default_services_for_business["'][\s\S]*p_business_types:\s*selectedBusinessTypes/i), "paid MP materialization must provision all selected rubros");
  assert(mpWebhook.match(/pending_signup_default_services_provision_failed|defaultServicesError/i), "paid MP materialization must fail closed when provisioning fails");
  assert(dashboardOnboarding.match(/rpc\(\s*["']provision_default_services_for_business["'][\s\S]*p_business_types:\s*selectedBusinessTypes/i), "legacy dashboard onboarding completion must provision selected rubro defaults");
  assert(dashboardOnboarding.match(/selected_business_types:\s*selectedBusinessTypes/i), "dashboard onboarding must persist selected rubros before provisioning");
});
