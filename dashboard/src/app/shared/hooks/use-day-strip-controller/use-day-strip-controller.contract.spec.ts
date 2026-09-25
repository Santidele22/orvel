import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const HOOK_PATH = new URL('./use-day-strip-controller.ts', import.meta.url);

const hookSource = (() => {
  try {
    return fs.readFileSync(HOOK_PATH, 'utf8');
  } catch {
    return '';
  }
})();

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index++) {
    const char = sourceText[index];
    if (char === '{') depth++;
    if (char === '}') depth--;

    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }

  return sourceText.slice(signatureStart);
}

/**
 * Extract the full signature+body of a module-level function.
 *
 * Properly skips the parameter list (which may contain nested `{ }` from
 * destructuring) by matching the closing `)` first, then counting brace
 * depth from the body's opening `{`.
 */
function topLevelFnBody(sourceText: string, fnName: string): string {
  const fnMatch = new RegExp(
    `\\n(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*\\(`
  ).exec(sourceText);
  if (!fnMatch?.index) return '';

  const paramOpen = fnMatch.index + fnMatch[0].length - 1; // position of '('

  // Match closing paren, handling nested parens in types/params
  let parenDepth = 0;
  let paramClose = -1;
  for (let i = paramOpen; i < sourceText.length; i++) {
    if (sourceText[i] === '(') parenDepth++;
    if (sourceText[i] === ')') parenDepth--;
    if (parenDepth === 0) {
      paramClose = i;
      break;
    }
  }
  if (paramClose === -1) return '';

  // Body's opening brace is AFTER paramClose
  const bodyOpen = sourceText.indexOf('{', paramClose + 1);
  if (bodyOpen === -1) return '';

  // Count brace depth from body opening
  let braceDepth = 0;
  for (let i = bodyOpen; i < sourceText.length; i++) {
    if (sourceText[i] === '{') braceDepth++;
    if (sourceText[i] === '}') braceDepth--;
    if (braceDepth === 0) {
      return sourceText.slice(fnMatch.index + 1, i + 1);
    }
  }

  return '';
}

describe('useDayStripController contract', () => {
  it('exists at the expected path', () => {
    expect(hookSource, 'use-day-strip-controller.ts must exist').not.toBe('');
  });

  it('imports signal and computed from @angular/core', () => {
    expect(hookSource).toMatch(
      /import\s*\{[^}]*\bsignal\b[^}]*\bcomputed\b[^}]*\}\s*from\s+['"]@angular\/core['"]/
    );
  });

  it('exports useDayStripController function', () => {
    expect(hookSource).toMatch(/export\s+function\s+useDayStripController\s*\(/);
  });

  it('returns selectedDate: Signal<Date> in the return value', () => {
    const returnMatch = hookSource.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch?.[0] ?? '', 'return block must exist').toMatch(
      /\bselectedDate\b/
    );
  });

  it('returns days: Signal<Date[]> in the return value', () => {
    const returnMatch = hookSource.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch?.[0] ?? '', 'return block must exist').toMatch(/\bdays\b/);
  });

  it('exposes nextDay function in the return value', () => {
    const returnMatch = hookSource.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch?.[0] ?? '', 'return block must exist').toMatch(/\bnextDay\b/);
  });

  it('exposes prevDay function in the return value', () => {
    const returnMatch = hookSource.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch?.[0] ?? '', 'return block must exist').toMatch(/\bprevDay\b/);
  });

  it('exposes goToDate function in the return value', () => {
    const returnMatch = hookSource.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch?.[0] ?? '', 'return block must exist').toMatch(/\bgoToDate\b/);
  });

  it('defaults anchor to today using new Date()', () => {
    const fnBody = topLevelFnBody(hookSource, 'useDayStripController');
    expect(fnBody, 'function body must default anchor to new Date()').toMatch(
      /options\?\.anchor\s*[?]{2}\s*new\s+Date\s*\(\)|anchor\s*[?]{2}\s*new\s+Date\s*\(\)/
    );
  });

  it('defaults length to 7 consecutive dates', () => {
    const fnBody = topLevelFnBody(hookSource, 'useDayStripController');
    expect(fnBody, 'function body must default length to 7').toMatch(
      /options\?\.length\s*[?]{2}\s*7|length\s*[?]{2}\s*7/
    );
  });

  it('uses signal() for selectedDate', () => {
    expect(hookSource, 'selectedDate must be defined via signal()').toMatch(
      /selectedDate\s*=\s*signal</
    );
  });

  it('uses computed() for days array', () => {
    expect(hookSource, 'days must be defined via computed()').toMatch(
      /\bdays\s*=\s*computed</
    );
  });
});
