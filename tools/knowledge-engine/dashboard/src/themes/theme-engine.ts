import type { ThemeConfig } from "./types.ts";
import { getAccent, getPreset } from "./presets.ts";
import { generateMaterial, rgbString } from "./material.ts";

/** @deprecated use `rgbString` from material.ts */
export function hexToRgb(hex: string): string {
  return rgbString(hex);
}

export function applyTheme(config: ThemeConfig): void {
  const preset = getPreset(config.presetId);
  const accent = getAccent(preset, config.accentId);
  const style = document.documentElement.style;

  // Seed: an explicit per-project seed wins ("dynamic from graph"),
  // otherwise the selected accent swatch.
  const seed = config.seed ?? accent.accent;

  // Generate the full M3 tonal palette and write every token.
  const { tokens } = generateMaterial(seed, preset.isDark);
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(`--${key}`, value);
  }

  // data-theme drives the CSS-only light/dark selectors.
  document.documentElement.setAttribute("data-theme", preset.isDark ? "dark" : "light");

  // Heading font preference. Defaults to the geometric sans (Product Sans /
  // Manrope) to match the M3 Expressive look.
  const fontMap: Record<string, string> = {
    sans: "var(--font-sans)",
    serif: "var(--font-serif)",
    mono: "var(--font-mono)",
  };
  const headingFont = config.headingFont ?? "sans";
  style.setProperty("--font-heading", fontMap[headingFont] ?? fontMap.sans);
}
