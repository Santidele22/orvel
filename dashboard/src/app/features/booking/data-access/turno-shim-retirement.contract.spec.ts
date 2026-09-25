import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_SRC = resolve(process.cwd(), 'src');
const SHIM = ['turno', 'facade'].join('.');
const SHIM_PATH = resolve(process.cwd(), 'src/app/features/booking/data-access', `${SHIM}.ts`);
const IMPORT_OR_READ = new RegExp(
  String.raw`from ['"][^'"]*${SHIM}['"]|${SHIM.replace('.', '\\.')}\.ts|read(?:Required)?File(?:Sync)?\([^)]*${SHIM}`
);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : /\.(ts|html)$/.test(entry) ? [full] : [];
  });
}

describe('booking leftover shim retirement', () => {
  it('does not keep the leftover TurnoService shim file on disk', () => {
    expect(existsSync(SHIM_PATH)).toBe(false);
  });

  it('does not import or read the leftover shim from production sources', () => {
    const offenders = listFiles(join(APP_SRC, 'app'))
      .filter((file) => !/\.(spec|test)\.ts$/.test(file) && readFileSync(file, 'utf8').includes(SHIM))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it('does not import or file-read the leftover shim from specs', () => {
    const offenders = listFiles(APP_SRC)
      .filter((file) => /\.(spec|test)\.ts$/.test(file) && IMPORT_OR_READ.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
