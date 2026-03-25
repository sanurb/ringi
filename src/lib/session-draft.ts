/**
 * Lightweight session draft persistence for review navigation state.
 *
 * Stores viewed files, selected file, and diff scope in localStorage.
 * Pure functions — no React dependency, trivially testable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionDraft {
  readonly viewedFiles: readonly string[];
  readonly selectedFile: string | null;
  readonly scope: string;
  readonly savedAt: number;
}

// ---------------------------------------------------------------------------
// Storage key & defaults
// ---------------------------------------------------------------------------

const STORAGE_KEY = "ringi.session-draft.v1";

// Drafts older than 30 minutes are not recoverable.
const MAX_AGE_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export const clearDraft = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently degrade.
  }
};

export const saveDraft = (draft: Omit<SessionDraft, "savedAt">): void => {
  if (typeof window === "undefined") {
    return;
  }

  const payload: SessionDraft = { ...draft, savedAt: Date.now() };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or unavailable — silently degrade.
  }
};

export const loadDraft = (): SessionDraft | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const data = JSON.parse(raw) as Record<string, unknown>;

    if (
      typeof data.savedAt !== "number" ||
      !Array.isArray(data.viewedFiles) ||
      typeof data.scope !== "string"
    ) {
      return null;
    }

    if (Date.now() - data.savedAt > MAX_AGE_MS) {
      clearDraft();
      return null;
    }

    return {
      savedAt: data.savedAt,
      scope: data.scope,
      selectedFile:
        typeof data.selectedFile === "string" ? data.selectedFile : null,
      viewedFiles: data.viewedFiles.filter(
        (v: unknown) => typeof v === "string"
      ),
    };
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/**
 * Human-friendly relative time label for the recovery modal.
 *
 * Examples: "just now", "1 minute ago", "5 minutes ago", "1 hour ago"
 */
export const formatRelativeTime = (savedAt: number): string => {
  const diffMs = Date.now() - savedAt;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 30) {
    return "just now";
  }

  if (diffMinutes < 1) {
    return "less than a minute ago";
  }

  if (diffMinutes === 1) {
    return "1 minute ago";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`;
  }

  if (diffHours === 1) {
    return "1 hour ago";
  }

  return `${diffHours} hours ago`;
};

// ---------------------------------------------------------------------------
// Validation — is a draft worth recovering?
// ---------------------------------------------------------------------------

export const isDraftRecoverable = (
  draft: SessionDraft | null,
  currentScope: string
): draft is SessionDraft =>
  draft !== null &&
  draft.scope === currentScope &&
  draft.viewedFiles.length > 0;
