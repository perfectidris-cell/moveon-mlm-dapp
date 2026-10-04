export const PLANET_BY_LEVEL: Record<number, string> = {
  1: 'Mercury',
  2: 'Venus',
  3: 'Earth',
  4: 'Mars',
  5: 'Jupiter',
  6: 'Saturn',
  7: 'Uranus',
  8: 'Neptune',
  9: 'Pluto',
  10: 'Ceres',
  11: 'Haumea',
  12: 'Makemake',
} as const;

export const PLANET_LEVELS = [
  'Mercury',
  'Venus',
  'Earth',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
  'Ceres',
  'Haumea',
  'Makemake',
] as const;

export function getPlanetName(level: number): string {
  return PLANET_BY_LEVEL[level] ?? `Level ${level}`;
}

export function getPlanetDisplay(level: number): string {
  const planet = PLANET_BY_LEVEL[level];
  return planet ? `Lv ${level} · ${planet}` : `Lv ${level}`;
}
