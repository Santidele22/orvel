import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFile, readdir } from 'node:fs/promises';

import {
  FORBIDDEN_VISITOR_JARGON,
  PRELAUNCH_RUBROS,
  initPrelaunchRubros
} from '../lib/prelaunch-rubros';

const RUBROS_PATH = new URL('../components/organisms/prelaunch/PrelaunchRubros.astro', import.meta.url);
const FEATURES_PATH = new URL('../components/organisms/prelaunch/PrelaunchFeatures.astro', import.meta.url);
const PRELAUNCH_DIR = new URL('../components/organisms/prelaunch/', import.meta.url);

const RUBRO_IDS = ['peluqueria', 'unas', 'barberia', 'masajes'] as const;

function visitorCopy(): string {
  return Object.values(PRELAUNCH_RUBROS)
    .flatMap((rubro) => [
      rubro.title,
      rubro.tag,
      rubro.headline,
      rubro.why,
      ...rubro.features.flatMap((feature) => [feature.title, feature.text])
    ])
    .join('\n');
}

function renderRubrosDocument() {
  const dom = new JSDOM(`
    <section id="rubros" data-rubros-root data-view="list">
      <div data-rubro-list>
        ${RUBRO_IDS.map(
          (id) => `
            <button type="button" data-rubro-id="${id}" aria-label="Ver ${PRELAUNCH_RUBROS[id].title}">
              <img class="rubro-thumb" alt="" />
              <h3 data-rubro-title>${PRELAUNCH_RUBROS[id].title}</h3>
            </button>
          `
        ).join('')}
      </div>
      <div data-rubro-detail hidden>
        <button type="button" data-rubro-back>Todos los rubros</button>
        <div data-rubro-copy></div>
        <button type="button" class="js-open-waitlist">Quiero mi lugar</button>
      </div>
    </section>
  `, { url: 'https://orvel.pro/' });

  return { dom, document: dom.window.document };
}

describe('Contract: prelaunch rubros copy and markup', () => {
  it('keeps the four rubros as buttons with waitlist CTA and no visitor jargon', async () => {
    const source = await readFile(RUBROS_PATH, 'utf8');
    const features = await readFile(FEATURES_PATH, 'utf8');

    expect(source).toContain('Hecho para quien vive de los turnos');
    expect(source).toContain('id="rubros"');
    expect(source).toMatch(/<section[^>]*bg-bg-primary/);
    expect(source).not.toMatch(/<section[^>]*bg-bg-secondary/);
    expect(source).toMatch(/<button[^>]*data-rubro-id/);
    expect(source).toContain('Ver por qué');
    expect(source).toContain('Quiero mi lugar');
    expect(source).toContain('js-open-waitlist');
    expect(source).toContain('startViewTransition');
    expect(source).toMatch(/data-rubro-back/);

    expect(visitorCopy()).toContain('Color y corte dejan de pelearse en la agenda.');
    expect(visitorCopy()).toContain('Tiempo entre sesiones');
    expect(visitorCopy()).not.toMatch(FORBIDDEN_VISITOR_JARGON);
    expect(source).not.toMatch(FORBIDDEN_VISITOR_JARGON);
    expect(features).not.toMatch(FORBIDDEN_VISITOR_JARGON);

    expect(source).toContain('PRELAUNCH_RUBRO_IDS');
    expect(source).toMatch(/data-rubro-id=\{id\}/);
    expect(Object.keys(PRELAUNCH_RUBROS)).toEqual(expect.arrayContaining([...RUBRO_IDS]));
    for (const id of RUBRO_IDS) {
      expect(PRELAUNCH_RUBROS[id].features).toHaveLength(4);
    }
  });

  it('does not paint prelaunch page sections with gray bands', async () => {
    const files = await readdir(PRELAUNCH_DIR);
    const astroFiles = files.filter((file) => file.endsWith('.astro'));

    for (const file of astroFiles) {
      const source = await readFile(new URL(file, PRELAUNCH_DIR), 'utf8');
      expect(source, file).not.toMatch(/<section\b[^>]*\bbg-bg-secondary\b/);
    }
  });
});

describe('Contract: rubro detail opens with View Transition fallback', () => {
  it('opens one detail without startViewTransition and returns to the list', () => {
    const { document } = renderRubrosDocument();
    initPrelaunchRubros(document);

    const root = document.querySelector<HTMLElement>('[data-rubros-root]')!;
    document.querySelector<HTMLButtonElement>('[data-rubro-id="peluqueria"]')!.click();

    expect(root.dataset.view).toBe('detail');
    expect(document.querySelector('[data-rubro-detail]')?.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('[data-rubro-copy]')?.textContent).toContain(
      'Color y corte dejan de pelearse en la agenda.'
    );
    expect(document.querySelectorAll('[data-rubro-detail]:not([hidden])').length).toBe(1);

    document.querySelector<HTMLButtonElement>('[data-rubro-back]')!.click();
    expect(root.dataset.view).toBe('list');
    expect(document.querySelector('[data-rubro-detail]')?.hasAttribute('hidden')).toBe(true);
  });

  it('uses startViewTransition when the browser provides it', async () => {
    const { document, dom } = renderRubrosDocument();
    let ranUpdate = false;
    const startViewTransition = (update: () => void) => {
      ranUpdate = true;
      update();
      return { finished: Promise.resolve() };
    };
    Object.defineProperty(dom.window.document, 'startViewTransition', {
      configurable: true,
      value: startViewTransition
    });

    initPrelaunchRubros(document);
    document.querySelector<HTMLButtonElement>('[data-rubro-id="unas"]')!.click();
    await Promise.resolve();

    expect(ranUpdate).toBe(true);
    expect(document.querySelector('[data-rubros-root]')?.getAttribute('data-view')).toBe('detail');
    expect(document.querySelector('[data-rubro-copy]')?.textContent).toContain('Cada servicio tiene su reloj');
  });
});
