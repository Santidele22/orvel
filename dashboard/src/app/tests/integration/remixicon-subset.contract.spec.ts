import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ANGULAR_JSON = 'angular.json';
const INDEX_HTML = 'src/index.html';
const SUBSET_CSS = 'src/styles/remixicon-used.css';
const FULL_CSS = 'node_modules/remixicon/fonts/remixicon.css';
const FULL_PACKAGE_STYLE = 'node_modules/remixicon/fonts/remixicon.css';
const USED_CLASS_RE = /ri-[a-z0-9-]+/g;

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function walkSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkSourceFiles(full, acc);
      continue;
    }
    if (/\.(html|ts)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function usedRemixClasses(): string[] {
  const files = walkSourceFiles(fromRoot('src'));
  const found = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.match(USED_CLASS_RE) ?? []) {
      found.add(match);
    }
  }
  return [...found].sort();
}

function classHasRule(css: string, className: string): boolean {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${escaped}(?:\\s|:|,|\\{)`, 'm').test(css);
}

describe('TDD contract: Remix Icon subset and mobile CSS budget', () => {
  it('does not ship the full Remix Icon stylesheet in angular.json styles', () => {
    const angularJson = JSON.parse(readFileSync(fromRoot(ANGULAR_JSON), 'utf8')) as {
      projects?: Record<string, { architect?: { build?: { options?: { styles?: string[] } } } }>;
    };
    const buildStyles =
      angularJson.projects?.['salon-de-belleza']?.architect?.build?.options?.styles ?? [];

    expect(buildStyles).not.toContain(FULL_PACKAGE_STYLE);
    expect(buildStyles).toContain(SUBSET_CSS);
  });

  it('keeps a subset stylesheet smaller than the full package CSS and covering used ri-* classes', () => {
    expect(existsSync(fromRoot(SUBSET_CSS))).toBe(true);
    expect(existsSync(fromRoot(FULL_CSS))).toBe(true);

    const subset = readFileSync(fromRoot(SUBSET_CSS), 'utf8');
    const full = readFileSync(fromRoot(FULL_CSS), 'utf8');
    const subsetBytes = Buffer.byteLength(subset, 'utf8');
    const fullBytes = Buffer.byteLength(full, 'utf8');

    expect(subsetBytes).toBeLessThan(fullBytes);

    const required = usedRemixClasses().filter((className) => classHasRule(full, className));
    expect(required.length).toBeGreaterThan(0);

    const missing = required.filter((className) => !classHasRule(subset, className));
    expect(missing).toEqual([]);
    expect(subset).toMatch(/@font-face\s*\{[\s\S]*font-family:\s*["']remixicon["']/);
    expect(subset).toMatch(/\[class\^="ri-"\]/);
  });

  it('loads only Inter 400/600/700 without blocking render', () => {
    const html = readFileSync(fromRoot(INDEX_HTML), 'utf8');
    const interHref = /family=Inter:wght@([^"&]+)/g;
    const weights = [...html.matchAll(interHref)].map((match) => match[1]);

    expect(weights.length).toBeGreaterThanOrEqual(2);
    expect(weights.every((value) => value === '400;600;700')).toBe(true);
    expect(html).toMatch(/media=["']print["'][^>]*onload=/i);
    expect(html).toMatch(/<noscript>[\s\S]*family=Inter:wght@400;600;700[\s\S]*<\/noscript>/);
  });

  it('keeps production script/style minify on and font inlining off', () => {
    const angularJson = JSON.parse(readFileSync(fromRoot(ANGULAR_JSON), 'utf8')) as {
      projects?: Record<
        string,
        {
          architect?: {
            build?: {
              configurations?: {
                production?: { optimization?: unknown };
              };
            };
          };
        }
      >;
    };
    const optimization =
      angularJson.projects?.['salon-de-belleza']?.architect?.build?.configurations?.production
        ?.optimization;

    expect(optimization).toEqual({
      scripts: true,
      styles: { minify: true, inlineCritical: true },
      fonts: { inline: false },
    });
  });
});
