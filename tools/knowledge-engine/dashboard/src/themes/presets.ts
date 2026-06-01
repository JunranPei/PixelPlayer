import type { AccentSwatch, ThemePreset } from "./types.ts";
import { generateMaterial, hexToHsl, hslToHex } from "./material.ts";

/**
 * Seed colors. The full Material 3 tonal palette (surfaces, on-colors,
 * borders, glow, edges …) is generated from whichever seed is active, so a
 * single list works for both the dark and light modes below.
 *
 * `accentDim` / `accentBright` here are only used for legacy callers and the
 * picker preview; the live values come from `generateMaterial`.
 */
function swatch(id: string, name: string, seed: string): AccentSwatch {
  const { h, s } = hexToHsl(seed);
  return {
    id,
    name,
    accent: seed,
    accentDim: hslToHex(h, s, Math.max(0, hexToHsl(seed).l - 0.08)),
    accentBright: hslToHex(h, s, Math.min(1, hexToHsl(seed).l + 0.1)),
  };
}

const SEED_SWATCHES: AccentSwatch[] = [
  swatch("violet", "Violet", "#7c5cff"),
  swatch("blue", "Blue", "#4f8cff"),
  swatch("cyan", "Cyan", "#22b8c3"),
  swatch("teal", "Teal", "#1bbf9c"),
  swatch("green", "Green", "#46c46b"),
  swatch("amber", "Amber", "#e8b04b"),
  swatch("orange", "Orange", "#f0853a"),
  swatch("rose", "Rose", "#e5709b"),
  swatch("magenta", "Magenta", "#d65cff"),
];

const DEFAULT_SEED = "#7c5cff";

function previewColors(isDark: boolean): Record<string, string> {
  const { root, surface } = generateMaterial(DEFAULT_SEED, isDark);
  return { root, surface };
}

export const PRESETS: ThemePreset[] = [
  {
    id: "m3-dark",
    name: "Dark",
    isDark: true,
    defaultAccentId: "violet",
    accentSwatches: SEED_SWATCHES,
    colors: previewColors(true),
  },
  {
    id: "m3-light",
    name: "Light",
    isDark: false,
    defaultAccentId: "violet",
    accentSwatches: SEED_SWATCHES,
    colors: previewColors(false),
  },
];

export function getPreset(id: string): ThemePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export function getAccent(preset: ThemePreset, accentId: string): AccentSwatch {
  return (
    preset.accentSwatches.find((s) => s.id === accentId) ??
    preset.accentSwatches.find((s) => s.id === preset.defaultAccentId) ??
    preset.accentSwatches[0]
  );
}
