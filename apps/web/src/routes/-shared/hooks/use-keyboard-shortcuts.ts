import { useEffect } from "react";

export interface Shortcut {
  key: string; // e.g. 'n', 'r', '?', 'Escape'
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  handler: () => void;
}

/**
 * Registers global keyboard shortcuts that fire on keydown.
 * Skips events originating from form inputs to avoid hijacking typing.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      for (const shortcut of shortcuts) {
        if (
          e.key === shortcut.key &&
          !!shortcut.ctrl === (e.ctrlKey || e.metaKey) &&
          !!shortcut.shift === e.shiftKey
        ) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
