/**
 * Material 3-style tonal palette generation from a single seed color.
 *
 * This is a pragmatic, dependency-free approximation of M3's HCT tonal ramps
 * (the real thing needs @material/material-color-utilities, ~tens of KB). We
 * work in HSL: hue is preserved from the seed, chroma is expressed as
 * saturation, and "tone" maps to lightness. It is deterministic and produces
 * a coherent, accessible-enough palette for both dark and light surfaces.
 *
 * The output is a flat record of CSS custom-property names (without the
 * leading `--`) → values, consumed by `theme-engine.applyTheme`.
 */

export interface Hsl {
  h: number; // 0-360
  s: number; // 0-1
  l: number; // 0-1
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp01(s);
  const ln = clamp01(l);
  let r: number, g: number, b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = hue2rgb(p, q, hn + 1 / 3);
    g = hue2rgb(p, q, hn);
    b = hue2rgb(p, q, hn - 1 / 3);
  }
  const to2 = (x: number) =>
    Math.round(clamp01(x) * 255).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Color at a given M3 "tone" (0-100 lightness) for a hue/chroma. */
function tone(h: number, sat: number, t: number): string {
  return hslToHex(h, sat, t / 100);
}

/** Node-type colors per mode. Kept as curated constants (distinct + legible). */
const NODE_COLORS_DARK: Record<string, string> = {
  "node-file": "#7aa2f7",
  "node-function": "#7ee0a0",
  "node-class": "#c89bff",
  "node-module": "#ffc66e",
  "node-concept": "#ff9ec4",
  "node-config": "#5eead4",
  "node-document": "#7dd3fc",
  "node-service": "#b59bff",
  "node-table": "#6ee7b7",
  "node-endpoint": "#ffb27d",
  "node-pipeline": "#ff9aa8",
  "node-schema": "#ffd95e",
  "node-resource": "#a5b4fc",
  "node-article": "#c9bcff",
  "node-entity": "#8bb8ff",
  "node-topic": "#ffd279",
  "node-claim": "#7ee0a0",
  "node-source": "#b0a8be",
};

const NODE_COLORS_LIGHT: Record<string, string> = {
  "node-file": "#3a63b8",
  "node-function": "#2f9e63",
  "node-class": "#7a4fd0",
  "node-module": "#b07d1f",
  "node-concept": "#c04f86",
  "node-config": "#0d9488",
  "node-document": "#0284c7",
  "node-service": "#6d4fd0",
  "node-table": "#0f9d6b",
  "node-endpoint": "#c2611f",
  "node-pipeline": "#d04f63",
  "node-schema": "#b08a1f",
  "node-resource": "#4f5fd0",
  "node-article": "#6d4fd0",
  "node-entity": "#2f63c0",
  "node-topic": "#b08a1f",
  "node-claim": "#2f9e63",
  "node-source": "#6b6478",
};

export interface MaterialResult {
  /** Flat map of CSS custom property (no leading `--`) → value. */
  tokens: Record<string, string>;
  /** Convenience: resolved key colors (for previews). */
  accent: string;
  root: string;
  surface: string;
}

/**
 * Build the full M3 token set from a seed hex for the given mode.
 */
export function generateMaterial(seed: string, isDark: boolean): MaterialResult {
  const { h, s } = hexToHsl(seed);
  // Boost chroma for an "expressive" feel, but stay below garish.
  const primSat = Math.min(0.95, Math.max(0.62, s));
  const neutralSat = 0.1; // subtle primary tint on neutrals
  const variantSat = 0.14;

  const t = (sat: number, toneL: number) => tone(h, sat, toneL);

  const accent = isDark ? t(primSat, 80) : t(primSat, 42);
  const accentDim = isDark ? t(primSat, 70) : t(primSat, 36);
  const accentBright = isDark ? t(primSat, 90) : t(primSat, 54);
  const accentRgb = rgbString(accent);
  const seedRgb = rgbString(seed);

  const root = isDark ? t(neutralSat, 8) : t(neutralSat, 97);
  const surface = isDark ? t(neutralSat, 11) : t(neutralSat, 94);
  const panel = isDark ? t(neutralSat, 14) : t(neutralSat, 96);
  const elevated = isDark ? t(neutralSat, 18) : t(0.02, 100);
  const elevatedHigh = isDark ? t(neutralSat, 23) : t(neutralSat, 92);

  const textPrimary = isDark ? t(0.08, 93) : t(variantSat, 12);
  const textSecondary = isDark ? t(variantSat, 80) : t(variantSat, 36);
  const textMuted = isDark ? t(variantSat, 62) : t(0.1, 52);

  const a = (rgb: string, alpha: number) => `rgba(${rgb}, ${alpha})`;

  const tokens: Record<string, string> = {
    // surfaces
    "color-root": root,
    "color-surface": surface,
    "color-panel": panel,
    "color-elevated": elevated,
    "color-elevated-high": elevatedHigh,

    // primary / accent
    "color-accent": accent,
    "color-accent-dim": accentDim,
    "color-accent-bright": accentBright,
    "color-on-accent": isDark ? t(primSat, 18) : "#ffffff",
    "color-accent-container": isDark ? t(primSat, 34) : t(primSat, 88),
    "color-on-accent-container": isDark ? t(primSat, 92) : t(primSat, 16),

    // text
    "color-text-primary": textPrimary,
    "color-text-secondary": textSecondary,
    "color-text-muted": textMuted,

    // borders / outline
    "color-border-subtle": a(accentRgb, isDark ? 0.12 : 0.14),
    "color-border-medium": a(accentRgb, isDark ? 0.24 : 0.22),

    // glass / scrim
    "glass-bg": isDark ? a(rgbString(panel), 0.72) : a(rgbString(elevated), 0.78),
    "glass-bg-heavy": isDark ? a(rgbString(surface), 0.94) : a(rgbString(elevated), 0.95),
    "glass-border": a(accentRgb, isDark ? 0.12 : 0.14),
    "glass-border-heavy": a(accentRgb, isDark ? 0.18 : 0.2),

    // scrollbar
    "scrollbar-thumb": a(accentRgb, isDark ? 0.22 : 0.28),
    "scrollbar-thumb-hover": a(accentRgb, isDark ? 0.4 : 0.45),

    // glow (use the more saturated seed for punch)
    "glow-accent": a(seedRgb, isDark ? 0.22 : 0.18),
    "glow-accent-strong": a(seedRgb, isDark ? 0.45 : 0.32),
    "glow-accent-pulse": a(seedRgb, isDark ? 0.7 : 0.5),

    // edges
    "color-edge": a(accentRgb, isDark ? 0.38 : 0.42),
    "color-edge-dim": a(accentRgb, isDark ? 0.08 : 0.1),
    "color-edge-dot": a(accentRgb, isDark ? 0.14 : 0.18),

    // overlays / state layers
    "color-accent-overlay-bg": a(seedRgb, isDark ? 0.08 : 0.07),
    "color-accent-overlay-border": a(accentRgb, isDark ? 0.28 : 0.3),

    // kbd
    "kbd-bg": a(accentRgb, isDark ? 0.12 : 0.12),
  };

  // node-type colors
  const nodeColors = isDark ? NODE_COLORS_DARK : NODE_COLORS_LIGHT;
  for (const [k, v] of Object.entries(nodeColors)) {
    tokens[`color-${k}`] = v;
  }

  return { tokens, accent, root, surface };
}
