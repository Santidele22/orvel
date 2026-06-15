import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPO_ROOT = path.resolve(ROOT, '..');
const SUPABASE_DIR = path.join(ROOT, 'supabase');
const FUNCTIONS_DIR = path.join(SUPABASE_DIR, 'functions');
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');

const REMINDER_ENTRYPOINT_NAMES = [
  'appointment-reminders-24h',
  'appointment-reminder-scheduler',
  'appointment-reminders-scheduler',
  'enqueue-appointment-reminders-24h',
];

interface EntrypointCandidate {
  kind: 'edge-function' | 'scheduled-config' | 'workflow' | 'script';
  filePath: string;
  source: string;
}

function readFileIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? fs.readFileSync(filePath, 'utf8') : null;
}

function listFilesRecursive(dir: string, predicate: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listFilesRecursive(filePath, predicate);
    }

    return predicate(filePath) ? [filePath] : [];
  });
}

function edgeFunctionCandidates(): EntrypointCandidate[] {
  return REMINDER_ENTRYPOINT_NAMES.flatMap((functionName) => {
    const filePath = path.join(FUNCTIONS_DIR, functionName, 'index.ts');
    const source = readFileIfExists(filePath);

    return source ? [{ kind: 'edge-function' as const, filePath, source }] : [];
  });
}

function configAndAutomationCandidates(): EntrypointCandidate[] {
  const configFiles = [path.join(SUPABASE_DIR, 'config.toml')]
    .map((filePath) => ({ filePath, source: readFileIfExists(filePath) }))
    .filter((candidate): candidate is { filePath: string; source: string } => candidate.source !== null);

  const workflowFiles = listFilesRecursive(WORKFLOWS_DIR, (filePath) => /\.(ya?ml)$/.test(filePath)).map((filePath) => ({
    filePath,
    source: fs.readFileSync(filePath, 'utf8'),
  }));

  const scriptFiles = listFilesRecursive(path.join(ROOT, 'scripts'), (filePath) => /\.(mjs|js|ts|sh)$/.test(filePath)).map((filePath) => ({
    filePath,
    source: fs.readFileSync(filePath, 'utf8'),
  }));

  return [
    ...configFiles.map((candidate) => ({ kind: 'scheduled-config' as const, ...candidate })),
    ...workflowFiles.map((candidate) => ({ kind: 'workflow' as const, ...candidate })),
    ...scriptFiles.map((candidate) => ({ kind: 'script' as const, ...candidate })),
  ];
}

function reminderEntrypointCandidates(): EntrypointCandidate[] {
  const allCandidates = [...edgeFunctionCandidates(), ...configAndAutomationCandidates()];

  return allCandidates.filter((candidate) => /enqueue_appointment_reminders_24h|appointment[-_]reminders[-_]24h|appointment[-_]reminder[-_]scheduler/i.test(candidate.source));
}

function expectEntrypointSource(): string {
  const candidates = reminderEntrypointCandidates();

  expect(
    candidates.map((candidate) => path.relative(ROOT, candidate.filePath)),
    'Expected a secure Edge Function or scheduled entrypoint dedicated to invoking enqueue_appointment_reminders_24h.',
  ).not.toHaveLength(0);

  const rpcInvoker = candidates.find((candidate) => /enqueue_appointment_reminders_24h/.test(candidate.source));

  expect(
    rpcInvoker ? path.relative(ROOT, rpcInvoker.filePath) : null,
    'Expected the reminder scheduler entrypoint to invoke the restricted enqueue_appointment_reminders_24h RPC.',
  ).not.toBeNull();

  return candidates.map((candidate) => candidate.source).join('\n\n');
}

describe('Orvel 24h appointment reminder scheduler RED contracts', () => {
  it('has a secure Edge Function or scheduled entrypoint that invokes enqueue_appointment_reminders_24h', () => {
    const source = expectEntrypointSource();

    expect(source).toMatch(/enqueue_appointment_reminders_24h/);
    expect(source).toMatch(/Deno\.serve|\[functions\.|schedule|cron|workflow_dispatch|on:\s*schedule/i);
  });

  it('requires CRON_KEY or service-only authorization for external/manual calls', () => {
    const source = expectEntrypointSource();

    expect(source).toMatch(/CRON_KEY|x-cron-key|Bearer\s+\$?\{?CRON_KEY|service_role/i);
    expect(source).toMatch(/401|403|UNAUTHORIZED|FORBIDDEN|not authorized/i);
    expect(source).not.toMatch(/authorization,\s*x-client-info,\s*apikey,\s*content-type[\s\S]*(?:return new Response\([^)]*success\s*:\s*true)/i);
  });

  it('uses the service role only server-side to call the restricted RPC', () => {
    const source = expectEntrypointSource();

    expect(source).toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role/i);
    expect(source).toMatch(/createClient[\s\S]*(SUPABASE_SERVICE_ROLE_KEY|serviceRole|service_role)/i);
    expect(source).toMatch(/rpc\(\s*['"]enqueue_appointment_reminders_24h['"]/);
    expect(source).not.toMatch(/SUPABASE_ANON_KEY[\s\S]*rpc\(\s*['"]enqueue_appointment_reminders_24h['"]/i);
  });

  it('returns deterministic success and error JSON payloads', () => {
    const source = expectEntrypointSource();

    expect(source).toMatch(/Content-Type['"]?\s*:\s*['"]application\/json/i);
    expect(source).toMatch(/JSON\.stringify\(\s*\{[\s\S]*(success|ok)\s*:\s*true[\s\S]*(enqueued|count|processed)/i);
    expect(source).toMatch(/JSON\.stringify\(\s*\{[\s\S]*(success|ok)\s*:\s*false[\s\S]*(error|code)/i);
    expect(source).toMatch(/status\s*:\s*(200|401|403|500)/);
  });

  it('is included in the deploy workflow when implemented as an Edge Function', () => {
    const edgeFunctions = edgeFunctionCandidates();

    expect(
      edgeFunctions.map((candidate) => path.relative(ROOT, candidate.filePath)),
      'Expected an Edge Function scheduler for 24h appointment reminders or an explicit non-Edge scheduled entrypoint contract.',
    ).not.toHaveLength(0);

    const workflowSources = listFilesRecursive(WORKFLOWS_DIR, (filePath) => /\.(ya?ml)$/.test(filePath))
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n\n');

    const deployedFunctionNames = edgeFunctions
      .map((candidate) => path.basename(path.dirname(candidate.filePath)))
      .filter((functionName) => new RegExp(`supabase\\s+functions\\s+deploy\\s+${functionName}|--all`, 'i').test(workflowSources));

    expect(
      deployedFunctionNames,
      'Expected deploy workflow to include the 24h appointment reminder Edge Function via supabase functions deploy <name> or --all.',
    ).toHaveLength(edgeFunctions.length);
  });
});
