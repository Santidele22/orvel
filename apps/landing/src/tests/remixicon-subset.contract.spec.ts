import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LAYOUT = 'src/layouts/Layout.astro';
const SUBSET_CSS = 'src/styles/remixicon-used.css';
const FULL_CSS = 'node_modules/remixicon/fonts/remixicon.css';
const PACKAGE_STYLESHEET_IMPORT = 'remixicon/fonts/remixicon.css';
const USED_CLASS_RE = /ri-[a-z0-9-]+/g;
const LEGACY_FONT_FILE_RE = /remixicon\.(?:svg|eot|ttf|woff)(?!2)/;

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
    if (/\.(astro|svelte|ts|html|css)$/.test(entry)) {
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

describe('TDD contract: landing Remix Icon subset', () => {
  it('imports the subset stylesheet instead of the full package stylesheet', () => {
    const layout = readFileSync(fromRoot(LAYOUT), 'utf8');

    expect(layout).not.toContain(PACKAGE_STYLESHEET_IMPORT);
    expect(layout).toContain('../styles/remixicon-used.css');
  });

  it('covers every used ri-* class and ships only the woff2 font', () => {
    expect(existsSync(fromRoot(SUBSET_CSS))).toBe(true);
    expect(existsSync(fromRoot(FULL_CSS))).toBe(true);

    const subset = readFileSync(fromRoot(SUBSET_CSS), 'utf8');
    const full = readFileSync(fromRoot(FULL_CSS), 'utf8');

    expect(Buffer.byteLength(subset, 'utf8')).toBeLessThan(Buffer.byteLength(full, 'utf8'));

    const required = usedRemixClasses().filter((className) => classHasRule(full, className));
    expect(required.length).toBeGreaterThan(0);

    const missing = required.filter((className) => !classHasRule(subset, className));
    expect(missing).toEqual([]);

    expect(subset).toMatch(/@font-face\s*\{[\s\S]*font-family:\s*["']remixicon["']/);
    expect(subset).toMatch(/\[class\^="ri-"\]/);
    expect(subset).toContain('remixicon.woff2');
    expect(subset).not.toMatch(LEGACY_FONT_FILE_RE);
  });
});
