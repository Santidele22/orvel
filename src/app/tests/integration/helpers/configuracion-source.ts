import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

function safeProcessCwd(): string {
  const processLike = (globalThis as { process?: { cwd?: () => string } }).process;
  if (typeof processLike?.cwd === 'function') {
    return processLike.cwd();
  }

  return '.';
}

const CONFIGURACION_DIR = 'src/app/pages/dashboard/configuracion';
const CONFIGURACION_PAGE_TS = `${CONFIGURACION_DIR}/configuracion.page.ts`;

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry: DirectoryEntry) => {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(absolute);
      }

      if (entry.isFile()) {
        return [absolute];
      }

      return [];
    })
  );

  return nested.flat();
}

export async function readConfiguracionSources(): Promise<{
  htmlByFile: Record<string, string>;
  htmlSource: string;
  tsSource: string;
  allSource: string;
}> {
  const baseDir = resolve(safeProcessCwd(), CONFIGURACION_DIR);
  const files = await walkFiles(baseDir);

  const htmlFiles = files.filter((file) => file.endsWith('.html')).sort();
  const htmlContents = await Promise.all(htmlFiles.map((file) => readFile(file, 'utf-8')));

  const htmlByFile = Object.fromEntries(
    htmlFiles.map((file, index) => [file, htmlContents[index] ?? ''])
  );

  const htmlSource = htmlContents.join('\n\n');
  const tsSource = await readFile(resolve(safeProcessCwd(), CONFIGURACION_PAGE_TS), 'utf-8');

  return {
    htmlByFile,
    htmlSource,
    tsSource,
    allSource: `${tsSource}\n${htmlSource}`
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractConditionalBlock(source: string, condition: string): string | null {
  const conditionMatcher = new RegExp(`@(?:if|else\\s+if)\\s*\\(${escapeRegex(condition)}\\)\\s*\\{`);
  const conditionMatch = conditionMatcher.exec(source);

  if (!conditionMatch || conditionMatch.index === undefined) {
    return null;
  }

  const startIndex = conditionMatch.index + conditionMatch[0].length;
  const nextConditionalMatcher = /@else\s+if\s*\([^)]*\)\s*\{|@else\s*\{/g;
  nextConditionalMatcher.lastIndex = startIndex;

  const nextConditionalMatch = nextConditionalMatcher.exec(source);
  const endIndex = nextConditionalMatch?.index ?? source.length;
  return source.slice(startIndex, endIndex);
}
