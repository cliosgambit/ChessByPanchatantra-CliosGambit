/** @typedef {{ key: string, label: string, category: string, hex: string, lightMode: object, darkMode: object }} BoardTheme */

function slugify(label) {
  return label.toLowerCase().replace(/\s+/g, '-');
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

export function darkenHex(hex, amount = 0.18) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

export function getContrastText(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? 'gray.800' : 'white';
}

/**
 * @param {string} label
 * @param {string} category
 * @param {string} hex
 * @returns {BoardTheme}
 */
function buildPastelTheme(label, category, hex) {
  const darkSq = darkenHex(hex, 0.16);
  const text = getContrastText(hex);
  return {
    key: slugify(label),
    label,
    category,
    hex,
    lightMode: { lightSq: hex, darkSq, text },
    darkMode: { lightSq: hex, darkSq, text },
  };
}

const PASTEL_PALETTE = [
  ['Greens', [
    ['Pastel Green', '#CFE8C6'],
    ['Sage Green', '#B7C9A8'],
    ['Mint Green', '#D8F3DC'],
  ]],
  ['Blues', [
    ['Pastel Blue', '#D6EAF8'],
    ['Sky Blue', '#CFE8FF'],
    ['Powder Blue', '#D4E6F1'],
    ['Dusty Blue', '#BFD7EA'],
  ]],
  ['Purples', [
    ['Lavender', '#DCCDFC'],
    ['Lilac', '#C8B6FF'],
    ['Soft Purple', '#E5D4FF'],
  ]],
  ['Pinks', [
    ['Blush Pink', '#FADADD'],
    ['Rose Pink', '#F7CAD0'],
  ]],
  ['Oranges', [
    ['Peach', '#FFD8BE'],
    ['Apricot', '#FEC89A'],
    ['Soft Coral', '#F8B4A0'],
  ]],
  ['Yellows', [
    ['Cream', '#FFF4D6'],
    ['Butter Yellow', '#FFF0B3'],
    ['Champagne', '#F7E7CE'],
  ]],
  ['Neutrals', [
    ['Warm Beige', '#EAD7C3'],
    ['Sand', '#DCC5A1'],
    ['Light Taupe', '#CDBBA7'],
    ['Mist Gray', '#DDE2E5'],
    ['Soft Slate', '#CBD5E1'],
  ]],
];

export const PASTEL_THEMES = PASTEL_PALETTE.flatMap(([category, colors]) =>
  colors.map(([label, hex]) => buildPastelTheme(label, category, hex))
);

/** Original board themes — never modify hex values or gradient stops. */
export const LEGACY_THEMES = [
  {
    key: 'classic-green',
    label: 'Classic Green',
    category: 'Legacy Colors',
    hex: '#ebecd0',
    lightMode: { lightSq: '#ebecd0', darkSq: '#779556', text: 'gray.800' },
    darkMode: { lightSq: '#B5CAA3', darkSq: '#779556', text: 'whiteAlpha.900' },
  },
  {
    key: 'warm-wood',
    label: 'Warm Wood',
    category: 'Legacy Colors',
    hex: '#f0d9b5',
    lightMode: { lightSq: '#f0d9b5', darkSq: '#b58863', text: 'gray.800' },
    darkMode: { lightSq: '#D8C6A8', darkSq: '#8B6950', text: 'whiteAlpha.900' },
  },
  {
    key: 'cool-slate',
    label: 'Cool Slate',
    category: 'Legacy Colors',
    hex: '#dee3e6',
    lightMode: { lightSq: '#dee3e6', darkSq: '#8ca2ad', text: 'gray.800' },
    darkMode: { lightSq: '#A0B0B8', darkSq: '#647E8A', text: 'whiteAlpha.900' },
  },
  {
    key: 'royal-purple',
    label: 'Royal Purple',
    category: 'Legacy Colors',
    hex: '#e6e6fa',
    lightMode: { lightSq: '#e6e6fa', darkSq: '#9370db', text: 'gray.800' },
    darkMode: { lightSq: '#B8A8E0', darkSq: '#6A4CAF', text: 'whiteAlpha.900' },
  },
  {
    key: 'sunset-coral',
    label: 'Sunset Coral',
    category: 'Legacy Colors',
    hex: '#ffebcd',
    lightMode: { lightSq: '#ffebcd', darkSq: '#ff7f50', text: 'gray.800' },
    darkMode: { lightSq: '#FFCBAA', darkSq: '#D96C44', text: 'whiteAlpha.900' },
  },
  {
    key: 'navy-gold',
    label: 'Navy Gold',
    category: 'Legacy Colors',
    hex: '#f4f1e8',
    lightMode: { lightSq: '#f4f1e8', darkSq: '#1e293b', text: 'gray.800' },
    darkMode: { lightSq: '#c9a227', darkSq: '#0f1729', text: 'whiteAlpha.900' },
  },
];

export const BOARD_THEMES = [...LEGACY_THEMES, ...PASTEL_THEMES];

export const THEME_CATEGORIES = [
  'Legacy Colors',
  ...PASTEL_PALETTE.map(([category]) => category),
];

const DEFAULT_LEGACY_THEME = LEGACY_THEMES[0];

function resolveTheme(key) {
  const legacy = LEGACY_THEMES.find((t) => t.key === key);
  if (legacy) return legacy;

  const pastel = PASTEL_THEMES.find((t) => t.key === key);
  if (pastel) return pastel;

  return DEFAULT_LEGACY_THEME;
}

export function getThemeByKey(key, colorMode = 'light') {
  const theme = resolveTheme(key);
  const mode = colorMode === 'light' ? theme.lightMode : theme.darkMode;
  return {
    themeKey: theme.key,
    lightColor: mode.lightSq,
    darkColor: mode.darkSq,
    textColor: mode.text,
    hex: theme.hex,
    label: theme.label,
  };
}

/**
 * Index-based fallback for modules without a stored theme_key.
 * Uses only LEGACY_THEMES so pre-existing modules keep their original colors.
 */
export function getThemeForIndex(index, colorMode = 'light') {
  const len = LEGACY_THEMES.length || 1;
  const numericIndex = Number(index);
  const safeIndex = Number.isFinite(numericIndex) && numericIndex >= 0 ? numericIndex : 0;
  const theme = LEGACY_THEMES[safeIndex % len] || DEFAULT_LEGACY_THEME;
  return getThemeByKey(theme.key, colorMode);
}

export function getThemesByCategory() {
  const groups = new Map();
  for (const theme of BOARD_THEMES) {
    const cat = theme.category || 'Other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(theme);
  }
  return THEME_CATEGORIES.filter((c) => groups.has(c)).map((category) => ({
    category,
    themes: groups.get(category),
  }));
}
