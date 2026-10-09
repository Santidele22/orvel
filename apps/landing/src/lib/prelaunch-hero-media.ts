export type PrelaunchHeroRubro = 'peluqueria' | 'barberia' | 'unas' | 'masajes';

export interface PrelaunchHeroMedia {
  id: PrelaunchHeroRubro;
  label: string;
  src: string;
}

export const PRELAUNCH_HERO_MEDIA: readonly PrelaunchHeroMedia[] = [
  {
    id: 'peluqueria',
    label: 'Peluquería',
    src: '/videos/hero-peluqueria.mp4',
  },
  {
    id: 'barberia',
    label: 'Barbería',
    src: '/videos/hero-barberia.mp4',
  },
  {
    id: 'unas',
    label: 'Uñas',
    src: '/videos/hero-unas.mp4',
  },
  {
    id: 'masajes',
    label: 'Masajes',
    src: '/videos/hero-masajes.mp4',
  },
];
