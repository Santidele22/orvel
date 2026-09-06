import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

import { PRELAUNCH_HERO_MEDIA } from '../lib/prelaunch-hero-media';

const HERO_PATH = new URL('../components/organisms/prelaunch/PrelaunchHero.astro', import.meta.url);
const TUTORIAL_MP4 = '/media/orvel-dashboard-tutorial-b.mp4';

async function heroSource(): Promise<string> {
  return readFile(HERO_PATH, 'utf8');
}

describe('Contract: prelaunch hero video carousel', () => {
  it('lists exactly the four covered rubros with Spanish UI labels', () => {
    expect(PRELAUNCH_HERO_MEDIA.map((slide) => slide.id)).toEqual([
      'peluqueria',
      'barberia',
      'unas',
      'masajes',
    ]);
    expect(PRELAUNCH_HERO_MEDIA.map((slide) => slide.label)).toEqual([
      'Peluquería',
      'Barbería',
      'Uñas',
      'Masajes',
    ]);
    expect(PRELAUNCH_HERO_MEDIA).toHaveLength(4);
  });

  it('renders imported slides as HTML videos and dots, without GSAP or signup', async () => {
    const source = await heroSource();

    expect(source).toMatch(/from ['"].*prelaunch-hero-media['"]/);
    expect(source).toMatch(/PRELAUNCH_HERO_MEDIA\.map/);
    expect(source).toMatch(/<video\b/);
    expect(source).toMatch(/data-hero-dot/);
    expect(source).toContain('/auth/signup/plan');
    expect(source).not.toContain('js-open-waitlist');
    expect(source).not.toMatch(/\bgsap\b/i);
    expect(source).not.toMatch(/document\.createElement/);
  });

  it('does not use the dashboard tutorial as a carousel slide', () => {
    expect(PRELAUNCH_HERO_MEDIA.some((slide) => slide.src.includes(TUTORIAL_MP4))).toBe(false);
  });

  it('does not put the dashboard tutorial mp4 on carousel videos', async () => {
    const source = await heroSource();
    const videoBlock = source.slice(source.indexOf('<video'), source.lastIndexOf('</video>'));

    expect(videoBlock).not.toContain(TUTORIAL_MP4);
  });
});
