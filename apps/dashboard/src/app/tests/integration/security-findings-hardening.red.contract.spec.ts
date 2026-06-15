import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const ANGULAR_CONFIG_PATH = path.join(ROOT, 'angular.json');
const ENV_PROD_PATH = path.join(ROOT, 'src', 'environments', 'environment.prod.ts');
const REAL_GATEWAY_PATH = path.join(ROOT, 'src', 'app', 'core', 'api', 'supabase-booking', 'real-gateway.ts');

const SENSITIVE_EDGE_FUNCTIONS = [
  path.join(ROOT, 'supabase', 'functions', 'create-subscription', 'index.ts'),
  path.join(ROOT, 'supabase', 'functions', 'cancel-subscription', 'index.ts'),
  path.join(ROOT, 'supabase', 'functions', 'change-subscription', 'index.ts'),
  path.join(ROOT, 'supabase', 'functions', 'mercadopago-webhook', 'index.ts')
];

function readFileOrThrow(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing required file: ${filePath}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

function loadAllMigrationsSql(): string {
  expect(fs.existsSync(MIGRATIONS_DIR), `Missing migrations directory: ${MIGRATIONS_DIR}`).toBe(true);
  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort();

  expect(sqlFiles.length, 'Expected at least one SQL migration').toBeGreaterThan(0);

  return sqlFiles
    .map((sqlFile) => fs.readFileSync(path.join(MIGRATIONS_DIR, sqlFile), 'utf8'))
    .join('\n\n');
}

describe('Security hardening findings RED contracts', () => {
  describe('HIGH) explicit RLS enablement for critical billing tables', () => {
    it('requires explicit ALTER TABLE ... ENABLE ROW LEVEL SECURITY for business_subscriptions and payment_webhook_events', () => {
      const migrationsSql = loadAllMigrationsSql();

      expect(migrationsSql).toMatch(
        /alter\s+table\s+public\.business_subscriptions\s+enable\s+row\s+level\s+security\s*;/i
      );
      expect(migrationsSql).toMatch(
        /alter\s+table\s+public\.payment_webhook_events\s+enable\s+row\s+level\s+security\s*;/i
      );
    });
  });

  describe('HIGH) frontend production config hardening', () => {
    it('requires a dedicated environment.prod.ts with production=true and no localhost/dev-url values', () => {
      const prodEnv = readFileOrThrow(ENV_PROD_PATH);

      expect(prodEnv).toMatch(/production\s*:\s*true/);
      expect(prodEnv).not.toMatch(/localhost|127\.0\.0\.1|dev\./i);
    });

    it('requires Angular production file replacement and forbids unsafe dev fallback stubs in production paths', () => {
      const angularConfig = JSON.parse(readFileOrThrow(ANGULAR_CONFIG_PATH)) as {
        projects?: Record<string, { architect?: { build?: { configurations?: { production?: { fileReplacements?: Array<{ replace: string; with: string }> } } } } }>;
      };

      const project = angularConfig.projects?.['salon-de-belleza'];
      const replacements =
        project?.architect?.build?.configurations?.production?.fileReplacements ?? [];

      const hasEnvironmentReplacement = replacements.some(
        (entry) =>
          entry?.replace === 'src/environments/environment.ts' &&
          entry?.with === 'src/environments/environment.prod.ts'
      );

      expect(hasEnvironmentReplacement, 'Missing production environment file replacement').toBe(true);

      const realGatewaySource = readFileOrThrow(REAL_GATEWAY_PATH);
      expect(realGatewaySource).not.toMatch(/atelier-zen|aegir22|fake-booking-/i);
      expect(realGatewaySource).not.toMatch(/USING TEMPORARY FALLBACK/i);
    });
  });

  describe('MEDIUM) rate limiting for sensitive edge functions', () => {
    it('requires visible rate-limiting guards (429 + limiter logic) in each sensitive edge function', () => {
      const missingRateLimit: string[] = [];

      const requiredSignals = [
        /rate\s*[-_ ]?limit/i,
        /too\s+many\s+requests/i,
        /\b429\b/,
        /x-forwarded-for|cf-connecting-ip|client-ip/i
      ];

      for (const filePath of SENSITIVE_EDGE_FUNCTIONS) {
        const source = readFileOrThrow(filePath);
        const hasSignal = requiredSignals.some((pattern) => pattern.test(source));
        if (!hasSignal) {
          missingRateLimit.push(path.relative(ROOT, filePath));
        }
      }

      expect(
        missingRateLimit,
        'Rate limiting guardrails are required in sensitive edge functions.'
      ).toEqual([]);
    });
  });

  describe('MEDIUM) defense-in-depth tenant isolation in admin booking paths', () => {
    it('requires admin booking mutations to scope booking reads/writes by business_id (not only booking id)', () => {
      const source = readFileOrThrow(REAL_GATEWAY_PATH);

      const adminSections = [
        /async\s+updateAdminBooking\([\s\S]*?\n\s*},/,
        /async\s+cancelAdminBooking\([\s\S]*?\n\s*},/,
        /async\s+rescheduleAdminBooking\([\s\S]*?\n\s*},/,
        /async\s+updateBookingStatus\([\s\S]*?\n\s*}\n/,
      ];

      for (const sectionPattern of adminSections) {
        const section = source.match(sectionPattern)?.[0] ?? '';
        expect(section.length).toBeGreaterThan(0);
        expect(section, 'Expected tenant scoping by business_id in admin booking path').toMatch(/\.eq\(\s*['"]business_id['"]/);
      }
    });
  });
});
