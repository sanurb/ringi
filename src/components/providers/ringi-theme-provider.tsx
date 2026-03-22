import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  startTransition,
} from "react";
import type { ReactNode } from "react";

import type { PaletteId } from "@/lib/theme/palettes";
import {
  readRingiPreferencesFromStorage,
  writeRingiPreferencesToStorage,
} from "@/lib/theme/preferences-storage";
import type {
  AppearanceMode,
  RingiPreferences,
} from "@/lib/theme/preferences-storage";
import { applyRingiThemeToDocument } from "@/lib/theme/sync-document-theme";

interface RingiThemeContextValue {
  appearance: AppearanceMode;
  palette: PaletteId;
  setAppearance: (mode: AppearanceMode) => void;
  setPalette: (id: PaletteId) => void;
  setPreferences: (next: RingiPreferences) => void;
}

const RingiThemeContext = createContext<RingiThemeContextValue | null>(null);

export const useRingiTheme = (): RingiThemeContextValue => {
  const ctx = use(RingiThemeContext);
  if (!ctx) {
    throw new Error("useRingiTheme must be used within RingiThemeProvider");
  }
  return ctx;
};

export const RingiThemeProvider = ({ children }: { children: ReactNode }) => {
  const [appearance, setAppearanceState] = useState<AppearanceMode>(
    () => readRingiPreferencesFromStorage().appearance
  );
  const [palette, setPaletteState] = useState<PaletteId>(
    () => readRingiPreferencesFromStorage().palette
  );

  const applyDom = useEffectEvent(() => {
    applyRingiThemeToDocument(document, appearance, palette);
  });

  useEffect(() => {
    applyDom();
  }, [appearance, palette]);

  useEffect(() => {
    if (appearance !== "system") {
      return;
    }
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyDom();
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [appearance]);

  useEffect(() => {
    writeRingiPreferencesToStorage({ appearance, palette });
  }, [appearance, palette]);

  const value = useMemo<RingiThemeContextValue>(
    () => ({
      appearance,
      palette,
      setAppearance: (mode) => {
        startTransition(() => setAppearanceState(mode));
      },
      setPalette: (id) => {
        startTransition(() => setPaletteState(id));
      },
      setPreferences: (next) => {
        startTransition(() => {
          setAppearanceState(next.appearance);
          setPaletteState(next.palette);
        });
      },
    }),
    [appearance, palette]
  );

  return (
    <RingiThemeContext.Provider value={value}>
      {children}
    </RingiThemeContext.Provider>
  );
};
