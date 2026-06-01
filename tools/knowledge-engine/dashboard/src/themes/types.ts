export type PresetId =
  | "m3-dark"
  | "m3-light";

export interface AccentSwatch {
  id: string;
  name: string;
  /** Seed color. The full M3 tonal palette is generated from this. */
  accent: string;
  accentDim: string;
  accentBright: string;
}

export interface ThemePreset {
  id: PresetId;
  name: string;
  isDark: boolean;
  /** Preview-only colors (root/surface) for the theme picker swatches. */
  colors: Record<string, string>;
  /** Seed colors selectable as the palette accent. */
  accentSwatches: AccentSwatch[];
  defaultAccentId: string;
}

export type HeadingFont = "sans" | "serif" | "mono";

export interface ThemeConfig {
  presetId: PresetId;
  accentId: string;
  /**
   * Optional raw seed hex. When present it overrides the selected accent
   * swatch — this is how a project's meta.theme can drive a fully dynamic,
   * per-project palette ("dynamic from graph").
   */
  seed?: string;
  headingFont?: HeadingFont;
}

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  presetId: "m3-dark",
  accentId: "violet",
  headingFont: "sans",
};
