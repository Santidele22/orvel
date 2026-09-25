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
    src: 'https://assets.mixkit.co/videos/43236/43236-720.mp4',
  },
  {
    id: 'barberia',
    label: 'Barbería',
    src: 'https://assets.mixkit.co/videos/43242/43242-720.mp4',
  },
  {
    id: 'unas',
    label: 'Uñas',
    src: 'https://assets.mixkit.co/videos/13084/13084-720.mp4',
  },
  {
    id: 'masajes',
    label: 'Masajes',
    src: 'https://assets.mixkit.co/videos/24136/24136-720.mp4',
  },
];
