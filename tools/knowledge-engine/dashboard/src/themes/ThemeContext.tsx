import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HeadingFont, PresetId, ThemeConfig, ThemePreset } from "./types.ts";
import { DEFAULT_THEME_CONFIG } from "./types.ts";
import { getPreset } from "./presets.ts";
import { applyTheme } from "./theme-engine.ts";

const STORAGE_KEY = "ua-theme";

interface ThemeContextValue {
  config: ThemeConfig;
  preset: ThemePreset;
  setPreset: (presetId: PresetId) => void;
  setAccent: (accentId: string) => void;
  setHeadingFont: (font: HeadingFont) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const HEX_RE = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!HEX_RE.test(v)) return undefined;
  return v.startsWith("#") ? v : `#${v}`;
}

/**
 * Normalize whatever a project's `meta.theme` provides into a ThemeConfig.
 * This is the "dynamic from graph" entry point — projects may supply a full
 * config, or just a seed/accent hex, or a `dark`/`mode` hint. Anything we
 * can't read falls through to the vibrant-violet default.
 */
export function normalizeMetaTheme(meta: unknown): ThemeConfig | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;

  // Determine mode (default dark).
  const isLight =
    m.mode === "light" || m.isDark === false || m.presetId === "m3-light";
  const presetId = isLight ? "m3-light" : "m3-dark";

  // Seed precedence: explicit seed → accent hex → nothing (use default swatch).
  const seed =
    normalizeHex(m.seed) ??
    normalizeHex(m.accent) ??
    normalizeHex((m as { primary?: unknown }).primary);

  const headingFont =
    m.headingFont === "serif" || m.headingFont === "mono"
      ? (m.headingFont as ThemeConfig["headingFont"])
      : "sans";

  if (!seed && typeof m.accentId !== "string") {
    // Nothing usable beyond mode — only worth returning if mode was explicit.
    if (!isLight && m.mode == null && m.isDark == null && m.presetId == null) {
      return null;
    }
  }

  return {
    presetId,
    accentId: typeof m.accentId === "string" ? m.accentId : "violet",
    ...(seed ? { seed } : {}),
    headingFont,
  };
}

function loadFromLocalStorage(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.presetId === "string" && typeof parsed.accentId === "string") {
      return parsed as ThemeConfig;
    }
    return null;
  } catch {
    return null;
  }
}

function saveToLocalStorage(config: ThemeConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage full or unavailable — ignore
  }
}

function resolveInitialTheme(metaTheme?: ThemeConfig | null): ThemeConfig {
  return loadFromLocalStorage() ?? metaTheme ?? DEFAULT_THEME_CONFIG;
}

interface ThemeProviderProps {
  metaTheme?: ThemeConfig | null;
  children: ReactNode;
}

export function ThemeProvider({ metaTheme, children }: ThemeProviderProps) {
  const [config, setConfig] = useState<ThemeConfig>(() => resolveInitialTheme(metaTheme));
  const initialized = useRef(false);

  // Apply theme on mount and config changes
  useEffect(() => {
    applyTheme(config);
    if (initialized.current) {
      saveToLocalStorage(config);
    }
    initialized.current = true;
  }, [config]);

  // Update if metaTheme arrives later (async fetch) and no localStorage preference exists
  useEffect(() => {
    if (metaTheme && !loadFromLocalStorage()) {
      setConfig(metaTheme);
    }
  }, [metaTheme]);

  const setPreset = useCallback((presetId: PresetId) => {
    setConfig((_prev) => {
      const newPreset = getPreset(presetId);
      return { presetId, accentId: newPreset.defaultAccentId };
    });
  }, []);

  const setAccent = useCallback((accentId: string) => {
    setConfig((prev) => ({ ...prev, accentId }));
  }, []);

  const setHeadingFont = useCallback((font: HeadingFont) => {
    setConfig((prev) => ({ ...prev, headingFont: font }));
  }, []);

  const preset = getPreset(config.presetId);

  return (
    <ThemeContext.Provider value={{ config, preset, setPreset, setAccent, setHeadingFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
