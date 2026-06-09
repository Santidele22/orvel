import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type BusinessTypeDefaultsModule = {
  isAllowedOnboardingBusinessType: (value: unknown) => boolean;
  buildInitialBusinessSettingsForOnboarding: (input: {
    businessId: string;
    businessName: string;
    businessType: string;
    plan: unknown;
    now?: string;
  }) => {
    businessType: string;
    capacity: number;
  };
};

const DEFAULTS_RELATIVE_PATH = 'src/app/features/onboarding/data-access/business-type-defaults.ts';

function readBusinessTypeDefaultsSource(): string {
  return fs.readFileSync(path.join(process.cwd(), DEFAULTS_RELATIVE_PATH), 'utf8');
}

async function loadBusinessTypeDefaults(): Promise<BusinessTypeDefaultsModule> {
  return (await import('../../features/onboarding/data-access/business-type-defaults')) as BusinessTypeDefaultsModule;
}

describe('RED contract: onboarding business-type defaults are catalog-backed', () => {
  it('CAT-OBD-001 @RED - must not keep a local ALLOWED_ONBOARDING_BUSINESS_TYPES array source of truth', () => {
    const source = readBusinessTypeDefaultsSource();

    expect(source, 'Allowed onboarding business types must derive from REFERENCE_CATALOG.businessTypes/aliases').toMatch(
      /REFERENCE_CATALOG|resolveBusinessTypeCodeFromCatalog|businessTypes/
    );
    expect(source, 'Remove the local allowed business type array; the catalog is the source of truth').not.toMatch(
      /(?:export\s+)?const\s+ALLOWED_ONBOARDING_BUSINESS_TYPES\s*[:=]/
    );
  });

  it('CAT-OBD-002 @RED - must not keep a local BUSINESS_TYPE_CAPACITY matrix source of truth', () => {
    const source = readBusinessTypeDefaultsSource();

    expect(source, 'Capacity defaults must read catalog defaultCapacity/default_capacity/metadata').toMatch(
      /defaultCapacity|default_capacity|metadata/
    );
    expect(source, 'Remove local business-type-to-capacity matrix').not.toMatch(
      /(?:const\s+)?BUSINESS_TYPE_CAPACITY\s*[:=][\s\S]*?\}/
    );
    expect(source, 'Do not index capacity from a local matrix during defaults build').not.toMatch(/BUSINESS_TYPE_CAPACITY\s*\[/);
  });

  it('CAT-OBD-003 @RED - validation delegates to catalog resolution instead of local includes allowlists', () => {
    const source = readBusinessTypeDefaultsSource();

    expect(source).toMatch(/resolveBusinessTypeCodeFromCatalog\s*\(\s*REFERENCE_CATALOG/);
    expect(source, 'Validation should check resolved catalog codes against catalog.businessTypes, not a local array').not.toMatch(
      /ALLOWED_ONBOARDING_BUSINESS_TYPES[\s\S]{0,160}\.includes\s*\(/
    );
  });

  it('CAT-OBD-004 @RED - accepts every current catalog onboarding code, including newly added codes', async () => {
    const defaults = await loadBusinessTypeDefaults();

    expect(
      ['peluqueria', 'unas', 'barberia', 'spa', 'pestanas', 'cejas', 'masajes', 'otro'].filter((code) =>
        defaults.isAllowedOnboardingBusinessType(code)
      )
    ).toEqual(['peluqueria', 'unas', 'barberia', 'spa', 'pestanas', 'cejas', 'masajes', 'otro']);
  });

  it('CAT-OBD-005 @RED - normalizes accented aliases to canonical codes before default capacity lookup', async () => {
    const defaults = await loadBusinessTypeDefaults();

    const unasSettings = defaults.buildInitialBusinessSettingsForOnboarding({
      businessId: 'business-unas',
      businessName: 'Studio Uñas',
      businessType: 'uñas',
      plan: 'PRO',
      now: '2026-06-08T00:00:00.000Z'
    });
    const pestanasSettings = defaults.buildInitialBusinessSettingsForOnboarding({
      businessId: 'business-pestanas',
      businessName: 'Lashes',
      businessType: 'pestañas',
      plan: 'PRO',
      now: '2026-06-08T00:00:00.000Z'
    });

    expect(unasSettings.businessType).toBe('unas');
    expect(unasSettings.capacity).toEqual(expect.any(Number));
    expect(Number.isFinite(unasSettings.capacity)).toBe(true);
    expect(pestanasSettings.businessType).toBe('pestanas');
    expect(pestanasSettings.capacity).toEqual(expect.any(Number));
    expect(Number.isFinite(pestanasSettings.capacity)).toBe(true);
  });
});
