import type { PaletteId } from "./palettes";
import type { AppearanceMode } from "./preferences-storage";

export const resolveDarkAppearance = (appearance: AppearanceMode): boolean => {
  if (appearance === "dark") {
    return true;
  }
  if (appearance === "light") {
    return false;
  }
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

export const applyRingiThemeToDocument = (
  doc: Document,
  appearance: AppearanceMode,
  palette: PaletteId
) => {
  const root = doc.documentElement;
  root.classList.toggle("dark", resolveDarkAppearance(appearance));
  root.dataset.ringiPalette = palette;
};
