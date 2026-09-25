import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFile, stat } from 'node:fs/promises';

import { initTutorialDialog } from '../lib/tutorial-dialog';

const HERO_PATH = new URL('../components/organisms/Hero.astro', import.meta.url);
const CAPTIONS_PATH = new URL('../../public/media/orvel-dashboard-tutorial-b.es.vtt', import.meta.url);

function renderFixture() {
  const dom = new JSDOM(`
    <a href="/media/orvel-dashboard-tutorial-b.mp4" data-tutorial-open>Ver tutorial</a>
    <dialog data-tutorial-dialog>
      <button type="button" data-tutorial-close>Cerrar</button>
      <video data-tutorial-video data-src="/media/orvel-dashboard-tutorial-b.mp4"></video>
      <div data-tutorial-error hidden>
        <p data-tutorial-error-message></p>
        <button type="button" data-tutorial-retry>Reintentar</button>
        <a href="/media/orvel-dashboard-tutorial-b.mp4" data-tutorial-fallback>Abrir video</a>
      </div>
    </dialog>
  `);
  const { document } = dom.window;
  const dialog = document.querySelector<HTMLDialogElement>('[data-tutorial-dialog]')!;
  const video = document.querySelector<HTMLVideoElement>('[data-tutorial-video]')!;

  Object.defineProperty(dialog, 'open', { value: false, writable: true });
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
    dialog.dispatchEvent(new dom.window.Event('close'));
  });
  video.pause = vi.fn();
  video.load = vi.fn();
  Object.defineProperty(video, 'currentTime', { value: 12, writable: true });

  return { dom, document, dialog, video };
}

describe('Contract: hero tutorial CTA and dialog', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('keeps the primary conversion CTA and exposes an accessible secondary tutorial action', async () => {
    const source = await readFile(HERO_PATH, 'utf8');

    expect(source).toMatch(/href=["']\/auth\/signup\/plan["'][^>]*>[\s\S]*?Empezar ahora[\s\S]*?<\/a>/i);
    expect(source).toMatch(/<a[^>]*href=["']\/media\/orvel-dashboard-tutorial-b\.mp4["'][^>]*data-tutorial-open[^>]*>[\s\S]*?Ver tutorial[\s\S]*?<\/a>/i);
    expect(source).toMatch(/data-tutorial-open[\s\S]*aria-controls=["']tutorial-dialog["']/i);
    expect(source).toMatch(/<dialog[^>]*aria-labelledby=["']tutorial-title["']/i);
    expect(source).toContain('data-src="/media/orvel-dashboard-tutorial-b.mp4"');
    expect(source).toContain('poster="/media/orvel-dashboard-tutorial-b-poster.webp"');
    expect(source).toMatch(/controls[\s\S]*playsinline[\s\S]*preload=["']none["']/i);
    expect(source).toContain('src="/media/orvel-dashboard-tutorial-b.es.vtt"');
    expect(source).toMatch(/kind=["']captions["'][\s\S]*srclang=["']es["']/i);
    expect(source).toMatch(/data-tutorial-error[\s\S]*role=["']alert["']/i);
    expect(source).toMatch(/data-tutorial-fallback[\s\S]*href=["']\/media\/orvel-dashboard-tutorial-b\.mp4["']/i);
    expect(source).not.toMatch(/<video[^>]*autoplay/i);
  });

  it('ships Spanish narrative captions for the music-and-SFX tutorial', async () => {
    const captions = await readFile(CAPTIONS_PATH, 'utf8');
    const captionsStat = await stat(CAPTIONS_PATH);

    expect(captions.startsWith('WEBVTT')).toBe(true);
    expect(captions).toContain('No estás desorganizada.');
    expect(captions).toContain('Tus clientes eligen desde un único link.');
    expect(captions).toContain('Más tranquilidad al atender.');
    expect(captions).toMatch(/\[(?:Música|Efecto)[^\]]+\]/);
    expect(captions.match(/\[(?:Música|Efecto)[^\]]+\]/g)?.length).toBeGreaterThanOrEqual(3);
    expect(captionsStat.size).toBeGreaterThan(300);
  });

  it('opens, locks scroll, closes with Escape, and returns focus to the trigger', () => {
    const { dom, document, dialog, video } = renderFixture();
    const trigger = document.querySelector<HTMLButtonElement>('[data-tutorial-open]')!;
    const closeButton = document.querySelector<HTMLButtonElement>('[data-tutorial-close]')!;
    const destroy = initTutorialDialog(document);

    trigger.focus();
    trigger.click();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(closeButton);
    expect(video.getAttribute('src')).toBe('/media/orvel-dashboard-tutorial-b.mp4');
    expect(video.load).toHaveBeenCalledOnce();

    dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
    expect(dialog.close).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(0);
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);

    destroy();
  });

  it('initializes idempotently and restores the original body overflow exactly once', () => {
    const { document, dialog } = renderFixture();
    const trigger = document.querySelector<HTMLAnchorElement>('[data-tutorial-open]')!;
    document.body.style.overflow = 'clip';

    const destroyFirst = initTutorialDialog(document);
    const destroySecond = initTutorialDialog(document);

    trigger.click();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    dialog.close();
    expect(document.body.style.overflow).toBe('clip');

    expect(destroySecond).toBe(destroyFirst);
    destroyFirst();
  });

  it('leaves the direct link and page scroll usable when showModal is missing or throws', () => {
    const { dom, document, dialog } = renderFixture();
    const trigger = document.querySelector<HTMLAnchorElement>('[data-tutorial-open]')!;
    const showModal = vi.fn(() => {
      throw new Error('dialog unavailable');
    });
    dialog.showModal = showModal;
    const destroy = initTutorialDialog(document);
    const click = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });

    trigger.dispatchEvent(click);

    expect(showModal).toHaveBeenCalledOnce();
    expect(click.defaultPrevented).toBe(false);
    expect(document.body.style.overflow).toBe('');
    destroy();
  });

  it('shows an accessible recovery state on video error and retries loading', () => {
    const { dom, document, video } = renderFixture();
    const trigger = document.querySelector<HTMLAnchorElement>('[data-tutorial-open]')!;
    const error = document.querySelector<HTMLElement>('[data-tutorial-error]')!;
    const message = document.querySelector<HTMLElement>('[data-tutorial-error-message]')!;
    const retry = document.querySelector<HTMLButtonElement>('[data-tutorial-retry]')!;
    const destroy = initTutorialDialog(document);

    trigger.click();
    video.dispatchEvent(new dom.window.Event('error'));
    expect(error.hidden).toBe(false);
    expect(message.textContent).toMatch(/No pudimos cargar el tutorial/i);

    retry.click();
    expect(error.hidden).toBe(true);
    expect(video.load).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('closes from the close button and a click on the dialog backdrop', () => {
    const { dom, document, dialog } = renderFixture();
    const trigger = document.querySelector<HTMLButtonElement>('[data-tutorial-open]')!;
    const closeButton = document.querySelector<HTMLButtonElement>('[data-tutorial-close]')!;
    const destroy = initTutorialDialog(document);

    trigger.click();
    closeButton.click();
    expect(dialog.close).toHaveBeenCalledTimes(1);

    trigger.click();
    dialog.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    expect(dialog.close).toHaveBeenCalledTimes(2);

    destroy();
  });
});
