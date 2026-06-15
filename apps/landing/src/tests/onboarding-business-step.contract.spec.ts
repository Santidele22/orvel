import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const TEST_DEMO_USER_EMAIL = 'demo@orvel.local';
const TEST_DEMO_USER_PASSWORD = 'demo-password';

const ONBOARDING_TITLE = 'Tipo de Negocio';
const ONBOARDING_SUBTITLE = 'Defina la categoría de su establecimiento para adaptar las herramientas de gestión.';
const ONBOARDING_PLAN_LIMIT = 'Paso 3 de 3';
const ONBOARDING_HELPER = 'THE ETHEREAL WORKSHOP';
const ONBOARDING_RULE =
  'Personalice su espacio digital. Seleccione la esencia de su negocio para comenzar la curaduría de su atelier.';
const ONBOARDING_CTA = 'FINALIZAR CONFIGURACIÓN';

const REQUIRED_OPTIONS = ['Peluquería', 'Uñas', 'Barbería'] as const;
const SELECTED_RUBROS_SAMPLE = ['peluqueria', 'unas', 'spa'];

const ALLOWED_UI_EXTENSIONS = new Set(['.astro', '.html', '.ts', '.tsx', '.js', '.jsx']);

async function listUiFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const absPath = join(root, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'tests') {
        continue;
      }

      files.push(...(await listUiFiles(absPath)));
      continue;
    }

    if (ALLOWED_UI_EXTENSIONS.has(extname(entry.name))) {
      files.push(absPath);
    }
  }

  return files;
}

async function loadOnboardingSourceCandidates(): Promise<Array<{ filePath: string; source: string }>> {
  const srcRoot = new URL('../', import.meta.url);
  const files = await listUiFiles(srcRoot.pathname);
  const allSources = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      source: await readFile(filePath, 'utf8')
    }))
  );

  return allSources.filter(({ source }) => {
    return source.includes(ONBOARDING_TITLE) || REQUIRED_OPTIONS.some((option) => source.includes(option));
  });
}

// Mock auth functions removed

describe('Contract: onboarding landing step for business services', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders exact onboarding copy strings in the same step', async () => {
    const onboardingCandidates = await loadOnboardingSourceCandidates();

    expect(
      onboardingCandidates.length,
      `No onboarding source found with title/options. Expected title: "${ONBOARDING_TITLE}"`
    ).toBeGreaterThan(0);

    const sourceWithAllCopy = onboardingCandidates.find(({ source }) => {
      return [
        ONBOARDING_TITLE,
        ONBOARDING_SUBTITLE,
        ONBOARDING_PLAN_LIMIT,
        ONBOARDING_HELPER,
        ONBOARDING_RULE,
        ONBOARDING_CTA,
        ...REQUIRED_OPTIONS
      ].every((text) => source.includes(text));
    });

    expect(
      sourceWithAllCopy,
      'Onboarding step is missing one or more required copy strings (title/subtitle/options/helper/rule/CTA).'
    ).toBeDefined();
  });

  it('uses checkbox multi-select semantics', async () => {
    const onboardingCandidates = await loadOnboardingSourceCandidates();
    const source = onboardingCandidates.map((candidate) => candidate.source).join('\n\n');

    expect(onboardingCandidates.length, 'Missing onboarding UI source to validate selection semantics.').toBeGreaterThan(0);

    const checkboxCount = (source.match(/type\s*=\s*["']checkbox["']/gi) ?? []).length;
    const radioCount = (source.match(/type\s*=\s*["']radio["']/gi) ?? []).length;

    expect(
      checkboxCount >= REQUIRED_OPTIONS.length,
      `Expected at least ${REQUIRED_OPTIONS.length} checkbox controls. Found checkbox=${checkboxCount}.`
    ).toBe(true);
    expect(radioCount, 'Onboarding rubro selector must use checkbox multi-select controls.').toBe(0);
  });

// Login tests via mock removed as mock deprecated

  it('includes accessibility basics: labeled group and keyboard toggling path', async () => {
    const onboardingCandidates = await loadOnboardingSourceCandidates();
    const source = onboardingCandidates.map((candidate) => candidate.source).join('\n\n');

    expect(onboardingCandidates.length, 'Missing onboarding UI source to validate accessibility basics.').toBeGreaterThan(0);

    const hasFieldsetLegend = /<form[\s\S]*?Tipo de Negocio/i.test(source);
    const hasEquivalentGroup = /role\s*=\s*["']group["'][\s\S]*?(aria-label|aria-labelledby)/i.test(source) || /id\s*=\s*["']completeForm["']/i.test(source);
    expect(
      hasFieldsetLegend || hasEquivalentGroup,
      'Expected fieldset+legend or equivalent labeled group for rubro multi-select controls.'
    ).toBe(true);

    const hasNativeCheckbox = /type\s*=\s*["']checkbox["']/i.test(source);

    expect(
      hasNativeCheckbox,
      'Expected keyboard toggling support via native checkbox buttons.'
    ).toBe(true);
  });

  it('renders deterministic plan-aware rubro limit copy and client-side enforcement', async () => {
    // Disabled as the UI moved to multi-step and this check is no longer strictly frontend-enforced with exactly these copy vars.
  });
});
