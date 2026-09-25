import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../../..');

function readRepoFile(pathFromRoot: string): string {
  return readFileSync(resolve(REPO_ROOT, pathFromRoot), 'utf-8');
}

describe('RED contract: public booking slug policy', () => {
  it('generates a canonical slug server-side from normalized business name plus a unique suffix and returns persisted identity', () => {
    const migration = readRepoFile('supabase/migrations/20260617130000_dashboard_auth_state.sql');

    expect(migration, 'Slug base must use the shared/canonical DB normalizer, not raw client-style regexp logic.').toMatch(
      /canonical_booking_slug\s*\(\s*v_business_name\s*\)/i
    );
    expect(migration, 'Persisted slug must append a server-generated opaque suffix to the normalized business name.').toMatch(
      /v_slug\s*:=\s*v_slug_base\s*\|\|\s*['"]-['"]\s*\|\|\s*substr\s*\(\s*replace\s*\(\s*gen_random_uuid\s*\(\s*\)\s*::text\s*,\s*['"]-['"]\s*,\s*['"]['"]\s*\)\s*,\s*1\s*,\s*8\s*\)/i
    );
    expect(migration, 'Public slug suffix must not directly reveal auth.uid or any user/business UUID prefix.').not.toMatch(
      /left\s*\(\s*v_(?:user|business)_id::text\s*,\s*8\s*\)/i
    );
    expect(migration, 'Slug insertion must retry on rare unique suffix collisions and keep the DB unique index as final guard.').toMatch(
      /LOOP[\s\S]*gen_random_uuid[\s\S]*EXCEPTION\s+WHEN\s+unique_violation[\s\S]*v_slug_attempts\s*>?=\s*5[\s\S]*END\s+LOOP/i
    );
    expect(migration, 'Onboarding RPC must return the persisted booking slug/business identity for consumers.').toMatch(
      /RETURN\s+jsonb_build_object\([\s\S]*['"]business_id['"][\s\S]*['"]booking_slug['"][\s\S]*v_slug/i
    );
  });

  it('does not let dashboard settings derive or save the public booking slug from the raw form business name', () => {
    const pageTs = readRepoFile('apps/dashboard/src/app/features/settings/pages/configuracion.page.ts');
    const facadeTs = readRepoFile('apps/dashboard/src/app/features/settings/data-access/business-settings.facade.ts');

    const publicBookingUrlBlock = pageTs.match(/readonly publicBookingUrl\s*=\s*computed\(\(\)\s*=>\s*\{[\s\S]*?\n\s*\}\);/)?.[0] ?? '';

    expect(publicBookingUrlBlock, 'Portal URL must prefer the persisted Supabase slug after hydration.').toMatch(
      /savedState\(\)\?\.slug|settings\(\)\?\.slug|getSnapshot\(\)\?\.slug/i
    );
    expect(publicBookingUrlBlock, 'Portal URL must not render mi-salon placeholder when persisted slug exists.').not.toMatch(/mi-salon/i);
    expect(publicBookingUrlBlock, 'Portal URL must never fallback to an Orvel-branded booking placeholder.').not.toMatch(/\/booking\/orvel|\borvel\b/i);

    expect(pageTs, 'Save path must not send a client-only raw normalized slug; backend must own slug generation.').not.toMatch(
      /slug:\s*values\.businessName\.toLowerCase\(\)/
    );
    expect(facadeTs, 'Settings facade must not generate mi-salon/raw-name public slugs on the client.').not.toMatch(
      /generateSlugFromName|mi-salon|slug:\s*persistedLocal\.slug\s*\|\|\s*this\.generateSlugFromName/i
    );
  });
});

describe('RED contract: signup onboarding server-owned plan and catalog inputs', () => {
  it('does not persist a paid plan supplied by authenticated caller input', () => {
    const migration = readRepoFile('supabase/migrations/20260617130000_dashboard_auth_state.sql');
    const functionBody = migration.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.complete_signup_onboarding[\s\S]*?\$\$([\s\S]*?)\$\$/i
    )?.[1] ?? '';

    expect(functionBody, 'Self-service onboarding must keep plan server-owned and FREE by default.').toMatch(
      /v_plan_code\s+text\s*:=\s*['"]FREE['"]/i
    );
    expect(
      functionBody,
      'Authenticated callers must not be able to materialize paid PRO/GROWTH/STARTER plans from p_plan_code.'
    ).not.toMatch(/v_plan_code\s*(?::=|=)\s*(?:upper\s*\(|coalesce\s*\()[\s\S]{0,160}p_plan_code/i);
    expect(functionBody, 'Persisted auth/database metadata must use the server-owned plan value.').toMatch(
      /jsonb_build_object\([\s\S]*['"]plan['"]\s*,\s*v_plan_code[\s\S]*['"]orvel_plan['"]\s*,\s*v_plan_code/i
    );
  });

  it('bounds and validates signup business input against the Supabase catalog', () => {
    const migration = readRepoFile('supabase/migrations/20260617130000_dashboard_auth_state.sql');

    expect(migration, 'Business name length must be bounded before persistence.').toMatch(
      /char_length\s*\(\s*v_business_name\s*\)\s*>\s*120/i
    );
    expect(migration, 'Business type length must be bounded before persistence.').toMatch(
      /char_length\s*\(\s*v_business_type\s*\)\s*>\s*64/i
    );
    expect(migration, 'Business type must be resolved through active business_types or aliases.').toMatch(
      /business_types[\s\S]*business_type_aliases[\s\S]*is_active\s*=\s*true/i
    );
  });
});

describe('RED contract: settings hydration from Supabase values', () => {
  it('hydrates displayed/saved values from businesses, business_settings and profiles instead of auth/local placeholders', () => {
    const facadeTs = readRepoFile('apps/dashboard/src/app/features/settings/data-access/business-settings.facade.ts');
    const templateHtml = readRepoFile('apps/dashboard/src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');

    expect(facadeTs, 'Hydration must load persisted business name and slug from businesses.').toMatch(
      /from\(['"]businesses['"]\)[\s\S]*select\(['"][^'"]*name[^'"]*slug[^'"]*['"]\)/i
    );
    expect(facadeTs, 'Hydration must map public contact fields from business_settings.').toMatch(
      /whatsapp[\s\S]*instagram[\s\S]*support_email/i
    );
    expect(facadeTs, 'Hydration must map profile public contact values from profiles.').toMatch(
      /from\(['"]profiles['"]\)[\s\S]*select\(['"][^'"]*first_name[^'"]*last_name[^'"]*phone[^'"]*['"]\)/i
    );
    expect(facadeTs, 'Business/profile display values must not be saved/displayed from placeholder fallbacks after Supabase load.').not.toMatch(
      /fallbackName\s*=\s*user\?\.negocioNombre|`Negocio \$\{businessId\}`|'Completar onboarding'|'Mi Negocio'/
    );

    expect(templateHtml, 'Example contact text belongs in placeholder attributes only.').toMatch(/placeholder="\+54 9 11 \.\.\."/);
    expect(templateHtml, 'Example contact placeholders must not be value bindings or rendered saved values.').not.toMatch(
      /value="(?:\+54 9 11|@tu_negocio|hola@tunegocio\.com)|>\s*(?:\+54 9 11|@tu_negocio|hola@tunegocio\.com)\s*</i
    );
  });
});
