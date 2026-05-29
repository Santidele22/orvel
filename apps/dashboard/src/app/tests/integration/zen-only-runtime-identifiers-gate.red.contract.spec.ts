import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, it } from 'vitest';

const ROOT = cwd();
const FORBIDDEN_IDENTIFIER = /\b(?:industrial|chic|ink)\b/gi;
const SOURCE_SCOPES = [
  'src/app/pages/dashboard',
  'src/app/shared',
  'src/app/core',
  'src/main.ts'
] as const;

function cwd(): string {
  const processLike = (globalThis as { process?: { cwd?: () => string } }).process;
  return typeof processLike?.cwd === 'function' ? processLike.cwd() : '.';
}

function isRuntimeSourceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (!/\.(ts|tsx|js|jsx|html|scss|css)$/.test(normalized)) return false;
  if (/\.(spec|test)\./.test(normalized)) return false;
  if (normalized.includes('/tests/') || normalized.includes('/__tests__/')) return false;
  if (normalized.includes('/generated/') || /\.generated\./.test(normalized)) return false;
  return true;
}

async function collectRuntimeFiles(scopePath: string): Promise<string[]> {
  const absolute = resolve(ROOT, scopePath);
  const fsStats = await stat(absolute);

  if (fsStats.isFile()) {
    return isRuntimeSourceFile(absolute) ? [absolute] : [];
  }

  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const next = resolve(absolute, entry.name);
      if (entry.isDirectory()) return collectRuntimeFiles(next);
      return isRuntimeSourceFile(next) ? [next] : [];
    })
  );

  return nested.flat();
}

type Offender = { file: string; count: number; sample: string[] };

async function scanForbiddenIdentifiers(files: string[]): Promise<Offender[]> {
  const offenders: Offender[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf-8');
    const matches = [...source.matchAll(FORBIDDEN_IDENTIFIER)];

    if (matches.length === 0) continue;

    offenders.push({
      file: relative(ROOT, file),
      count: matches.length,
      sample: matches.slice(0, 5).map((match) => match[0])
    });
  }

  return offenders.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}

describe('Contract gate: zen-only runtime source identifiers', () => {
  it('fails when runtime source still references industrial/chic/ink', async () => {
    const runtimeFiles = (await Promise.all(SOURCE_SCOPES.map((scope) => collectRuntimeFiles(scope)))).flat();
    const offenders = await scanForbiddenIdentifiers(runtimeFiles);

    if (offenders.length > 0) {
      const topOffenders = offenders.slice(0, 10);
      const summary = topOffenders
        .map((offender) => `- ${offender.file} (${offender.count}) [${offender.sample.join(', ')}]`)
        .join('\n');

      throw new Error(
        [
          'Non-zen identifiers detected in runtime source files.',
          `Scopes checked: ${SOURCE_SCOPES.join(', ')}`,
          `Files scanned: ${runtimeFiles.length}`,
          `Total offending files: ${offenders.length}`,
          'Top offending files:',
          summary
        ].join('\n')
      );
    }
  });
});
