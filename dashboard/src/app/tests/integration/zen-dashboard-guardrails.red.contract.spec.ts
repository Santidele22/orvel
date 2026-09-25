import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = cwd();
const DESIGN_SYSTEM_PATH = 'DESIGN_SYSTEM.md';
const ZEN_SCOPE = [
  'src/app/pages/dashboard',
  'src/app/shared/dashboard-shell',
  'src/app/shared/dashboard-sidebar',
  'src/app/shared/dashboard-topbar'
] as const;

const NON_ZEN_THEME_IDENTIFIER = /\b(?:industrial|chic|ink)\b/gi;
const HEX_COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b/g;
const TAILWIND_NAMED_COLOR_UTILITY =
  /\b(?:bg|text|border|from|to|via|ring|stroke|fill|decoration|caret|outline)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const RAW_ARBITRARY_NUMERIC_UTILITY =
  /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y|h|min-h|max-h|w|min-w|max-w|text|leading|tracking|rounded|inset|top|right|bottom|left)-\[[^\]]*\d[^\]]*\]\b/g;
const RAW_SCALE_UTILITY =
  /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-x|space-y|h|min-h|max-h|w|min-w|max-w|text|leading|tracking|rounded|inset|top|right|bottom|left)-\d+\b/g;
const RAW_STYLE_NUMERIC_LITERAL =
  /\b(?:padding|margin|font-size|line-height|letter-spacing|width|height|min-width|min-height|max-width|max-height|border-radius)\s*:\s*[^;]*\d(?:px|rem|em|%|vh|vw)\b/gi;

const TOKEN_COLOR_KEYS = [
  'background',
  'surface',
  'primary',
  'secondary',
  'accent',
  'text',
  'success',
  'warning',
  'danger',
  'bg',
  'onPrimary',
  'focusRing'
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

type Offender = { file: string; samples: string[] };

async function scan(files: string[], pattern: RegExp): Promise<Offender[]> {
  const offenders: Offender[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf-8');
    const matches = [...source.matchAll(pattern)];
    if (matches.length === 0) continue;

    offenders.push({
      file: relative(ROOT, file),
      samples: [...new Set(matches.slice(0, 6).map((match) => match[0]))]
    });
  }

  return offenders.sort((a, b) => a.file.localeCompare(b.file));
}

function formatOffenders(offenders: Offender[]): string {
  return offenders.map((offender) => `- ${offender.file}: [${offender.samples.join(', ')}]`).join('\n');
}

function extractZenPaletteFromDesignSystem(markdown: string): string[] {
  const zenSection = markdown.match(/Atelier Zen[\s\S]*?(?=\n- \*\*🌸 Atelier Chic|$)/i)?.[0] ?? '';
  const hexMatches = [...zenSection.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toUpperCase());
  return [...new Set(hexMatches)];
}

function toRgbTuple(hexColor: string): [number, number, number] {
  const normalized = hexColor.replace('#', '').toLowerCase();
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function isAllowedZenColor(value: string, allowedHexColors: Set<string>): boolean {
  const normalized = value.trim().toUpperCase();

  if (allowedHexColors.has(normalized)) return true;

  if (/^#[0-9A-F]{8}$/.test(normalized)) {
    return allowedHexColors.has(`#${normalized.slice(1, 7)}`);
  }

  const rgba = normalized.match(/^RGBA?\(([^)]+)\)$/);
  if (!rgba) return false;

  const channels = rgba[1]
    .split(',')
    .map((part) => part.trim())
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));

  if (channels.length !== 3 || channels.some((channel) => Number.isNaN(channel))) return false;

  for (const allowedHex of allowedHexColors) {
    const [r, g, b] = toRgbTuple(allowedHex);
    if (channels[0] === r && channels[1] === g && channels[2] === b) return true;
  }

  return false;
}

describe('RED guardrails: Zen dashboard design-system compliance', () => {
  it('rejects non-zen theme identifiers in Zen dashboard runtime scope', async () => {
    const runtimeFiles = (await Promise.all(ZEN_SCOPE.map((scope) => collectRuntimeFiles(scope)))).flat();
    const offenders = await scan(runtimeFiles, NON_ZEN_THEME_IDENTIFIER);

    expect(
      offenders,
      [
        'Non-Zen theme identifiers found in Zen dashboard scope.',
        `Scopes checked: ${ZEN_SCOPE.join(', ')}`,
        formatOffenders(offenders)
      ].join('\n')
    ).toEqual([]);
  });

  it('enforces Zen palette from DESIGN_SYSTEM.md as the only palette source', async () => {
    const designSystemMarkdown = await readFile(resolve(ROOT, DESIGN_SYSTEM_PATH), 'utf-8');
    const zenPalette = extractZenPaletteFromDesignSystem(designSystemMarkdown);

    expect(zenPalette).toEqual(['#F2F4F3', '#8BA888', '#D9C5B2']);

    const { DASHBOARD_THEME_PALETTES } = await import('../../core/theming/dashboard-theme-palettes.tokens');
    const zenTokens = DASHBOARD_THEME_PALETTES['zen'];
    const allowedZenColors = new Set(zenPalette);

    const disallowed = TOKEN_COLOR_KEYS.filter(
      (tokenKey) => !isAllowedZenColor(String(zenTokens[tokenKey]), allowedZenColors)
    );

    expect(
      disallowed,
      [
        'Dashboard Zen semantic tokens contain colors outside DESIGN_SYSTEM.md Zen palette.',
        `Allowed palette: ${zenPalette.join(', ')}`,
        `Disallowed keys: ${disallowed.join(', ')}`
      ].join('\n')
    ).toEqual([]);
  });

  it('forbids hardcoded colors in Zen dashboard runtime files', async () => {
    const runtimeFiles = (await Promise.all(ZEN_SCOPE.map((scope) => collectRuntimeFiles(scope)))).flat();
    const hexOffenders = await scan(runtimeFiles, HEX_COLOR_LITERAL);
    const namedColorOffenders = await scan(runtimeFiles, TAILWIND_NAMED_COLOR_UTILITY);

    expect(
      [...hexOffenders, ...namedColorOffenders],
      [
        'Hardcoded colors detected in Zen dashboard scope. Use design tokens only.',
        `Scopes checked: ${ZEN_SCOPE.join(', ')}`,
        `Hex offenders:\n${formatOffenders(hexOffenders)}`,
        `Named utility offenders:\n${formatOffenders(namedColorOffenders)}`
      ].join('\n')
    ).toEqual([]);
  });

  it('forbids raw sizing/spacing/typography literals outside token definitions', async () => {
    const runtimeFiles = (await Promise.all(ZEN_SCOPE.map((scope) => collectRuntimeFiles(scope)))).flat();
    const arbitraryUtilityOffenders = await scan(runtimeFiles, RAW_ARBITRARY_NUMERIC_UTILITY);
    const scaleUtilityOffenders = await scan(runtimeFiles, RAW_SCALE_UTILITY);
    const styleLiteralOffenders = await scan(runtimeFiles, RAW_STYLE_NUMERIC_LITERAL);

    expect(
      [...arbitraryUtilityOffenders, ...scaleUtilityOffenders, ...styleLiteralOffenders],
      [
        'Raw literals detected for spacing/sizing/typography in Zen scope.',
        'Move values into token definition files and consume tokens from components/templates.',
        `Arbitrary utility offenders:\n${formatOffenders(arbitraryUtilityOffenders)}`,
        `Scale utility offenders:\n${formatOffenders(scaleUtilityOffenders)}`,
        `Style literal offenders:\n${formatOffenders(styleLiteralOffenders)}`
      ].join('\n')
    ).toEqual([]);
  });
});
