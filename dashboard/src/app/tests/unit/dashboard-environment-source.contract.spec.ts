import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const DASHBOARD_ROOT = new URL('../../../../', import.meta.url);
const REPO_ROOT = new URL('../../', DASHBOARD_ROOT);

const ENVIRONMENTS_DIR = new URL('src/environments/', DASHBOARD_ROOT);
const GENERATED_ENV_FILE = 'environment.generated.ts';
const GENERATOR_SCRIPT = 'scripts/generate-dashboard-env.mjs';
const ENVIRONMENT_MODULE = 'src/environments/environment.ts';

const HARDCODED_CREDENTIAL_RE = /supabase\.co|sb_publishable_|sb_secret_|eyJ[A-Za-z0-9_-]{10}/;
const LEGACY_PROJECT_REF_RE = /tzqgwziyiospmvpdgbnt/;

async function readDashboardFile(relativePath: string): Promise<string> {
  return readFile(new URL(relativePath, DASHBOARD_ROOT), 'utf8');
}

describe('TDD contract: dashboard Supabase env comes from .env, never from committed source', () => {
  it('keeps no hardcoded Supabase URL or key in committed environment modules', async () => {
    const files = await readdir(ENVIRONMENTS_DIR);

    for (const file of files) {
      if (!file.endsWith('.ts') || file === GENERATED_ENV_FILE) continue;

      const source = await readFile(new URL(file, ENVIRONMENTS_DIR), 'utf8');
      expect(source, `${file} must not hardcode Supabase credentials`).not.toMatch(HARDCODED_CREDENTIAL_RE);
      expect(source, `${file} must not reference the legacy project ref`).not.toMatch(LEGACY_PROJECT_REF_RE);
    }
  });

  it('keeps the legacy project ref and real keys out of the test bootstrap', async () => {
    const source = await readDashboardFile('src/test-setup.ts');

    expect(source).not.toMatch(HARDCODED_CREDENTIAL_RE);
    expect(source).not.toMatch(LEGACY_PROJECT_REF_RE);
  });

  it('swaps the environment module for the generated one in every build configuration', async () => {
    const angularJson = JSON.parse(await readDashboardFile('angular.json')) as {
      projects?: Record<
        string,
        {
          architect?: {
            build?: {
              configurations?: Record<string, { fileReplacements?: { replace: string; with: string }[] }>;
            };
          };
        }
      >;
    };

    const configurations = angularJson.projects?.['salon-de-belleza']?.architect?.build?.configurations ?? {};

    for (const name of ['production', 'development']) {
      const replacements = configurations[name]?.fileReplacements ?? [];
      const match = replacements.find((entry) => entry.replace === ENVIRONMENT_MODULE);

      expect(match, `${name} configuration must replace ${ENVIRONMENT_MODULE}`).toBeDefined();
      expect(match?.with).toBe(`src/environments/${GENERATED_ENV_FILE}`);
    }
  });

  it('generates the environment module from process env and .env files before build and serve', async () => {
    const generator = await readDashboardFile(GENERATOR_SCRIPT);

    expect(generator).toContain('PUBLIC_SUPABASE_URL');
    expect(generator).toContain('PUBLIC_SUPABASE_ANON_KEY');
    expect(generator).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(generator).toContain(GENERATED_ENV_FILE);
    expect(generator).toMatch(/\.env\.local/);

    const dashboardPackage = JSON.parse(await readDashboardFile('package.json')) as {
      scripts?: Record<string, string>;
    };
    const scripts = dashboardPackage.scripts ?? {};

    expect(scripts.build).toContain(GENERATOR_SCRIPT);
    expect(scripts.build).toContain('--production');
    expect(scripts.start).toContain(GENERATOR_SCRIPT);
  });

  it('keeps the generated module out of git and runs the generator for the local dev proxy', async () => {
    const dashboardIgnore = await readDashboardFile('.gitignore');
    expect(dashboardIgnore).toContain(GENERATED_ENV_FILE);

    const rootPackage = JSON.parse(await readFile(new URL('package.json', REPO_ROOT), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(rootPackage.scripts?.['dev:dashboard:proxy']).toContain(GENERATOR_SCRIPT);
  });
});
