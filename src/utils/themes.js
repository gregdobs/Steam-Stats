// Base blur (px) per theme and the user-adjustable intensity multiplier applied
// on top of it. Final --ss-blur = round(THEME_BASE_BLUR[theme] * BLUR_MULTIPLIERS[intensity]).
export const THEME_BASE_BLUR = { dark: 30, light: 26, vapor: 46 };

export const BLUR_MULTIPLIERS = { soft: 0.6, standard: 1, deep: 1.5 };

export const THEMES = [
  { id: 'dark', label: 'Dark glass', note: 'Frosted panels over a deep aurora', swatchBg: 'linear-gradient(150deg,#0b111b,#06080c)', swatchAccent: '#6fc8f7' },
  { id: 'light', label: 'Light glass', note: 'Daylight surfaces, same depth', swatchBg: 'linear-gradient(150deg,#f4f7fb,#dfe7f2)', swatchAccent: '#1f8ecb' },
  { id: 'vapor', label: 'Fully translucent', note: 'Barely-there panels, heavy blur', swatchBg: 'linear-gradient(150deg,#111a2b,#070a12)', swatchAccent: '#9fdcff' },
];

export const BLUR_STEPS = [
  { id: 'soft', label: 'Soft' },
  { id: 'standard', label: 'Standard' },
  { id: 'deep', label: 'Deep' },
];
