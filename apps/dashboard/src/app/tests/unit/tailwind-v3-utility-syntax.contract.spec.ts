// Guard: `apps/dashboard` and `apps/dashboard-web` run Tailwind v3 (a
// `tailwind.config.js`, no `@tailwindcss/vite`), so the v4-only CSS-variable
// shorthand `utility-(--var)` compiles to nothing: the class never reaches the
// stylesheet and the element silently loses that style.
//
// That is exactly how the logout confirm dialog broke. Its overlay shipped as
// `fixed inset-(--zen-space-xs)`: without `inset` the element kept
// `position: fixed` with no coordinates, stayed in its static position outside
// the visible shell and never appeared.
//
// Use the v3 forms instead: an arbitrary value (`inset-[var(--zen-space-xs)]`,
// with a `length:`/`color:` hint when the property is ambiguous), one of the
// semantic utilities declared in `tailwind.config.js` (`p-zen-lg`,
// `inset-zen-xs`, `bg-surface`, `text-text-primary`, …) or a plain palette class.
//
// The landing is Tailwind v4, where the shorthand is valid, so it is out of scope.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const V3_APP_SOURCES = [
  new URL('../../../', import.meta.url), // apps/dashboard/src
  new URL('../../../../../dashboard-web/src/', import.meta.url), // apps/dashboard-web/src
];

const V4_ONLY_SHORTHAND = /[a-z-]+-\(--[a-z0-9-]+\)/g;

describe('Contract: the Tailwind v3 apps avoid the v4-only shorthand', () => {
  it('does not use `utility-(--var)` classes', () => {
    const offenders: string[] = [];

    for (const root of V3_APP_SOURCES) {
      for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
        if (!/\.(html|ts)$/.test(file) || /\.spec\.ts$/.test(file)) continue;

        const source = readFileSync(new URL(file, root), 'utf8');
        for (const match of source.matchAll(V4_ONLY_SHORTHAND)) {
          offenders.push(`${file}: ${match[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
