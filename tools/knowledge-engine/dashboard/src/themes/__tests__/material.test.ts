import { describe, it, expect } from "vitest";
import {
  generateMaterial,
  hexToHsl,
  hslToHex,
  hexToRgb,
  rgbString,
} from "../material.ts";

const HEX = /^#[0-9a-f]{6}$/;

describe("hex/hsl conversions", () => {
  it("round-trips primary-ish hues within tolerance", () => {
    for (const hex of ["#7c5cff", "#4f8cff", "#1bbf9c", "#e8b04b"]) {
      const { h, s, l } = hexToHsl(hex);
      const back = hexToHsl(hslToHex(h, s, l));
      expect(Math.abs(back.h - h)).toBeLessThan(2);
      expect(Math.abs(back.s - s)).toBeLessThan(0.02);
      expect(Math.abs(back.l - l)).toBeLessThan(0.02);
    }
  });

  it("expands 3-digit hex", () => {
    expect(hexToRgb("#abc")).toEqual(hexToRgb("#aabbcc"));
  });

  it("rgbString formats channels", () => {
    expect(rgbString("#7c5cff")).toBe("124, 92, 255");
  });
});

describe("generateMaterial", () => {
  it("emits a complete, valid token set for dark mode", () => {
    const { tokens } = generateMaterial("#7c5cff", true);
    const required = [
      "color-root",
      "color-surface",
      "color-elevated",
      "color-accent",
      "color-text-primary",
      "color-border-subtle",
      "color-edge",
      "color-node-file",
      "color-node-article",
    ];
    for (const key of required) {
      expect(tokens[key], `missing token ${key}`).toBeTruthy();
    }
    // Solid color tokens must be valid hex.
    expect(tokens["color-root"]).toMatch(HEX);
    expect(tokens["color-accent"]).toMatch(HEX);
    // Alpha tokens are rgba().
    expect(tokens["color-edge"]).toMatch(/^rgba\(/);
  });

  it("produces a darker surface in dark mode than light mode", () => {
    const dark = generateMaterial("#7c5cff", true);
    const light = generateMaterial("#7c5cff", false);
    expect(hexToHsl(dark.root).l).toBeLessThan(hexToHsl(light.root).l);
  });

  it("preserves the seed hue in the accent", () => {
    const seedHue = hexToHsl("#1bbf9c").h;
    const { accent } = generateMaterial("#1bbf9c", true);
    expect(Math.abs(hexToHsl(accent).h - seedHue)).toBeLessThan(8);
  });

  it("different seeds yield different accents", () => {
    const a = generateMaterial("#7c5cff", true).accent;
    const b = generateMaterial("#1bbf9c", true).accent;
    expect(a).not.toBe(b);
  });
});
