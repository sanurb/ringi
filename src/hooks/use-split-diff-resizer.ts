import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "ringi:split-diff-ratio";
const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const KEYBOARD_STEP = 0.01;
const KEYBOARD_STEP_LARGE = 0.05;

/**
 * CSS override injected once into the pierre/diffs shadow root.
 * CSS custom properties set on the host element inherit into shadow DOM,
 * so `--ringi-split-left` / `--ringi-split-right` are readable here.
 */
const SHADOW_STYLE_ID = "ringi-split-override";
const SHADOW_CSS = `
[data-diff-type='split'][data-overflow='scroll'] {
  grid-template-columns: var(--ringi-split-left, 1fr) var(--ringi-split-right, 1fr) !important;
}
[data-diff-type='split'][data-overflow='wrap'] {
  grid-template-columns:
    var(--diffs-grid-number-column-width)
    var(--ringi-split-left, 1fr)
    var(--diffs-grid-number-column-width)
    var(--ringi-split-right, 1fr) !important;
}
`;

const clampRatio = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

const loadRatio = (): number => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number.parseFloat(stored);
      if (Number.isFinite(parsed)) {
        return clampRatio(parsed);
      }
    }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_RATIO;
};

const saveRatio = (ratio: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, ratio.toFixed(4));
  } catch {
    /* storage unavailable */
  }
};

/**
 * Injects the CSS override into the shadow root of a `diffs-container` element.
 * Returns `true` if injection succeeded.
 */
const injectShadowStyle = (container: HTMLElement): boolean => {
  const shadow = (container as HTMLElement & { shadowRoot: ShadowRoot | null })
    .shadowRoot;
  if (!shadow) {
    return false;
  }
  if (shadow.querySelector(`#${SHADOW_STYLE_ID}`)) {
    return true;
  }

  const style = document.createElement("style");
  style.id = SHADOW_STYLE_ID;
  style.textContent = SHADOW_CSS;
  shadow.append(style);
  return true;
};

/**
 * Sets the CSS custom properties on the `diffs-container` host element.
 * These inherit into the shadow DOM where our injected CSS rule reads them.
 */
const applySplitRatio = (container: HTMLElement, ratio: number) => {
  container.style.setProperty("--ringi-split-left", `${ratio}fr`);
  container.style.setProperty("--ringi-split-right", `${1 - ratio}fr`);
};

export interface SplitDiffResizerState {
  /** Current split ratio (0–1, left pane fraction). */
  ratio: number;
  /** Whether the user is actively dragging. */
  isDragging: boolean;
  /** Ref to attach to the wrapper div containing the PatchDiff. */
  wrapperRef: React.RefCallback<HTMLDivElement>;
  /** Props to spread on the splitter handle element. */
  splitterProps: {
    role: string;
    tabIndex: number;
    "aria-label": string;
    "aria-valuenow": number;
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-orientation": "vertical";
    onPointerDown: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDoubleClick: () => void;
  };
}

export const useSplitDiffResizer = (
  enabled: boolean
): SplitDiffResizerState => {
  const [ratio, setRatioState] = useState(loadRatio);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for drag computation (avoid stale closures, no re-renders during drag)
  const wrapperElRef = useRef<HTMLDivElement | null>(null);
  const diffsContainerRef = useRef<HTMLElement | null>(null);
  const ratioRef = useRef(ratio);
  const draggingRef = useRef(false);

  // Keep ratioRef in sync
  ratioRef.current = ratio;

  const setRatio = useCallback((next: number) => {
    const clamped = clampRatio(next);
    ratioRef.current = clamped;
    setRatioState(clamped);
    saveRatio(clamped);
    if (diffsContainerRef.current) {
      applySplitRatio(diffsContainerRef.current, clamped);
    }
  }, []);

  // Discover and inject into the diffs-container shadow root
  const setupDiffsContainer = useCallback(
    (wrapper: HTMLDivElement | null) => {
      if (!wrapper || !enabled) {
        return;
      }

      const tryInject = () => {
        const container = wrapper.querySelector("diffs-container");
        if (!container) {
          return false;
        }

        const el = container as HTMLElement;
        diffsContainerRef.current = el;
        const ok = injectShadowStyle(el);
        if (ok) {
          applySplitRatio(el, ratioRef.current);
        }
        return ok;
      };

      // Try immediately
      if (tryInject()) {
        return;
      }

      // Shadow DOM might not be ready yet — observe for it
      const observer = new MutationObserver(() => {
        if (tryInject()) {
          observer.disconnect();
        }
      });
      observer.observe(wrapper, { childList: true, subtree: true });

      // Clean up after 5s max
      const timeout = setTimeout(() => observer.disconnect(), 5000);
      return () => {
        observer.disconnect();
        clearTimeout(timeout);
      };
    },
    [enabled]
  );

  const wrapperRef: React.RefCallback<HTMLDivElement> = useCallback(
    (node) => {
      wrapperElRef.current = node;
      setupDiffsContainer(node);
    },
    [setupDiffsContainer]
  );

  // Re-inject when ratio changes (for component re-renders with new PatchDiff)
  useEffect(() => {
    if (diffsContainerRef.current && enabled) {
      injectShadowStyle(diffsContainerRef.current);
      applySplitRatio(diffsContainerRef.current, ratio);
    }
  }, [ratio, enabled]);

  // --- Drag handlers ---

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !wrapperElRef.current) {
        return;
      }
      e.preventDefault();

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      draggingRef.current = true;
      setIsDragging(true);

      // Prevent text selection during drag
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const wrapperRect = wrapperElRef.current.getBoundingClientRect();

      const onPointerMove = (ev: PointerEvent) => {
        if (!draggingRef.current) {
          return;
        }
        const x = ev.clientX - wrapperRect.left;
        const newRatio = clampRatio(x / wrapperRect.width);
        ratioRef.current = newRatio;

        // Update DOM directly for performance (no React re-render during drag)
        if (diffsContainerRef.current) {
          applySplitRatio(diffsContainerRef.current, newRatio);
        }

        // Move the splitter handle via CSS variable on the wrapper
        if (wrapperElRef.current) {
          wrapperElRef.current.style.setProperty(
            "--ringi-splitter-left",
            `${newRatio * 100}%`
          );
        }
      };

      const onPointerUp = () => {
        draggingRef.current = false;
        setIsDragging(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";

        // Commit the final ratio to React state + storage
        setRatio(ratioRef.current);

        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [enabled, setRatio]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled) {
        return;
      }

      const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      let handled = false;

      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        setRatio(ratioRef.current - step);
        handled = true;
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        setRatio(ratioRef.current + step);
        handled = true;
      } else if (e.key === "Home") {
        setRatio(MIN_RATIO);
        handled = true;
      } else if (e.key === "End") {
        setRatio(MAX_RATIO);
        handled = true;
      } else if (e.key === "Enter" || e.key === " ") {
        setRatio(DEFAULT_RATIO);
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [enabled, setRatio]
  );

  const handleDoubleClick = useCallback(() => {
    setRatio(DEFAULT_RATIO);
  }, [setRatio]);

  return {
    isDragging,
    ratio,
    splitterProps: {
      "aria-label": "Resize diff panes",
      "aria-orientation": "vertical" as const,
      "aria-valuemax": MAX_RATIO * 100,
      "aria-valuemin": MIN_RATIO * 100,
      "aria-valuenow": Math.round(ratio * 100),
      onDoubleClick: handleDoubleClick,
      onKeyDown: handleKeyDown,
      onPointerDown: handlePointerDown,
      role: "separator",
      tabIndex: 0,
    },
    wrapperRef,
  };
};
