import { RINGI_PALETTES } from "./palettes";
import type { PaletteId } from "./palettes";

export const RINGI_PREFERENCES_STORAGE_KEY = "ringi.preferences.v1";

export type AppearanceMode = "dark" | "light" | "system";

export interface RingiPreferences {
  appearance: AppearanceMode;
  palette: PaletteId;
}

export const DEFAULT_RINGI_PREFERENCES: RingiPreferences = {
  appearance: "system",
  palette: "ringi",
};

const PALETTE_IDS = new Set<PaletteId>(
  RINGI_PALETTES.map((p: (typeof RINGI_PALETTES)[number]) => p.id)
);

const isAppearanceMode = (v: unknown): v is AppearanceMode =>
  v === "dark" || v === "light" || v === "system";

const isPaletteId = (v: unknown): v is PaletteId =>
  typeof v === "string" && PALETTE_IDS.has(v as PaletteId);

export const parseRingiPreferences = (raw: string | null): RingiPreferences => {
  if (!raw) {
    return DEFAULT_RINGI_PREFERENCES;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const { appearance } = data;
    const { palette } = data;
    return {
      appearance: isAppearanceMode(appearance)
        ? appearance
        : DEFAULT_RINGI_PREFERENCES.appearance,
      palette: isPaletteId(palette)
        ? palette
        : DEFAULT_RINGI_PREFERENCES.palette,
    };
  } catch {
    return DEFAULT_RINGI_PREFERENCES;
  }
};

export const readRingiPreferencesFromStorage = (): RingiPreferences => {
  if (typeof window === "undefined") {
    return DEFAULT_RINGI_PREFERENCES;
  }
  return parseRingiPreferences(
    localStorage.getItem(RINGI_PREFERENCES_STORAGE_KEY)
  );
};

export const writeRingiPreferencesToStorage = (prefs: RingiPreferences) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(RINGI_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
};

/** Inline script for <head>: applies class + palette before paint (must stay in sync with read logic). */
export const getRingiThemeBootScript = (): string => {
  const key = JSON.stringify(RINGI_PREFERENCES_STORAGE_KEY);
  const allowed = `{${RINGI_PALETTES.map(
    (x: (typeof RINGI_PALETTES)[number]) => `${JSON.stringify(x.id)}:1`
  ).join(",")}}`;
  return `(function(){try{var k=${key};var ok=${allowed};var d=JSON.parse(localStorage.getItem(k)||'null');var a=d&&d.appearance;var p=d&&d.palette;var appearance=a==='dark'||a==='light'||a==='system'?a:'system';var pal=ok[p]?p:'ringi';var dark=appearance==='dark'||(appearance==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.dataset.ringiPalette=pal;}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.ringiPalette='ringi';}})();`;
};
