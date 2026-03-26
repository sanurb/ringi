"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from "react";

import { cn } from "@/lib/utils";

interface CodeSuggestionEditorProps {
  value: string;
  onChange: (value: string) => void;
  originalCode?: string;
  filePath?: string;
  lineNumber?: number;
}

const MIN_TEXTAREA_ROWS = 2;
const MAX_TEXTAREA_ROWS = 8;

const resizeTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) {
    return;
  }

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight || "0") || 16;
  const paddingTop = Number.parseFloat(styles.paddingTop || "0");
  const paddingBottom = Number.parseFloat(styles.paddingBottom || "0");
  const borderTop = Number.parseFloat(styles.borderTopWidth || "0");
  const borderBottom = Number.parseFloat(styles.borderBottomWidth || "0");
  const minHeight =
    lineHeight * MIN_TEXTAREA_ROWS +
    paddingTop +
    paddingBottom +
    borderTop +
    borderBottom;
  const maxHeight =
    lineHeight * MAX_TEXTAREA_ROWS +
    paddingTop +
    paddingBottom +
    borderTop +
    borderBottom;

  textarea.style.height = "0px";
  const nextHeight = Math.min(
    Math.max(textarea.scrollHeight, minHeight),
    maxHeight
  );
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > maxHeight ? "auto" : "hidden";
};

const editorPaneClassName =
  "min-h-[220px] rounded-lg border border-border-default bg-surface-primary shadow-inner shadow-black/10";

const codeBlockClassName =
  "h-full min-h-[180px] w-full rounded-md border border-transparent bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-text-primary outline-none";

const getOriginalCodeValue = (originalCode?: string) => {
  if (originalCode && originalCode.length > 0) {
    return originalCode;
  }
  return "No original code available";
};

export const CodeSuggestionEditor = ({
  value,
  onChange,
  originalCode,
  filePath,
  lineNumber,
}: CodeSuggestionEditorProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inlineTextareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [expandedValue, setExpandedValue] = useState(value);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    resizeTextarea(inlineTextareaRef.current);
  }, [value]);

  useEffect(() => {
    if (!isExpanded) {
      setExpandedValue(value);
    }
  }, [isExpanded, value]);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      expandedTextareaRef.current?.focus();
      const length = expandedTextareaRef.current?.value.length ?? 0;
      expandedTextareaRef.current?.setSelectionRange(length, length);
      resizeTextarea(expandedTextareaRef.current);
    }, 0);

    return () => window.clearTimeout(focusTimer);
  }, [isExpanded]);

  const handleDialogClose = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const closeExpandedModal = useCallback(() => {
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    setExpandedValue(value);
    setIsExpanded(false);
  }, [value]);

  const openExpandedModal = useCallback(() => {
    if (dialogRef.current?.open) {
      return;
    }

    setExpandedValue(value);
    dialogRef.current?.showModal();
    setIsExpanded(true);
  }, [value]);

  const handleApply = useCallback(() => {
    onChange(expandedValue);
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    setIsExpanded(false);
  }, [expandedValue, onChange]);

  const handleRemove = useCallback(() => {
    onChange("");
    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
    setExpandedValue("");
    setIsExpanded(false);
  }, [onChange]);

  const handleDialogCancel = useCallback(
    (event: SyntheticEvent<HTMLDialogElement, Event>) => {
      event.preventDefault();
      event.stopPropagation();
      closeExpandedModal();
    },
    [closeExpandedModal]
  );

  const handleExpandedKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeExpandedModal();
    },
    [closeExpandedModal]
  );

  const handleInlineChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(event.target.value);
      resizeTextarea(event.target);
    },
    [onChange]
  );

  const handleExpandedChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setExpandedValue(event.target.value);
      resizeTextarea(event.target);
    },
    []
  );

  return (
    <>
      <div className="animate-in fade-in rounded-lg border border-border-default/80 bg-surface-elevated duration-100">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary">
            Suggestion
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openExpandedModal}
              className="inline-flex h-6 items-center rounded-md px-2 font-mono text-[10px] text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
              aria-label="Expand code suggestion editor"
            >
              Expand
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex h-6 items-center rounded-md px-2 font-mono text-[10px] text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-status-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
              aria-label="Remove code suggestion"
            >
              Remove
            </button>
          </div>
        </div>

        <div className="px-3 py-2.5">
          <textarea
            ref={inlineTextareaRef}
            value={value}
            onChange={handleInlineChange}
            rows={MIN_TEXTAREA_ROWS}
            spellCheck={false}
            placeholder="Suggest a replacement…"
            className="max-h-[13rem] min-h-[3.5rem] w-full resize-none overflow-y-hidden rounded-md border border-border-default/70 bg-surface-primary px-3 py-2 font-mono text-xs leading-5 text-text-primary shadow-inner shadow-black/10 outline-none transition-colors placeholder:text-text-tertiary/70 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
            aria-label="Suggested replacement code"
          />
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onCancel={handleDialogCancel}
        onClose={handleDialogClose}
        className="m-auto w-full max-w-5xl rounded-2xl border border-border-default/80 bg-surface-elevated p-0 text-text-primary shadow-2xl shadow-black/40 backdrop:bg-black/50"
        aria-label="Expanded code suggestion editor"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="text-sm font-medium text-text-primary">Suggestion</p>
            {filePath ? (
              <span className="truncate font-mono text-[10px] text-text-tertiary">
                {filePath}
                {lineNumber != null ? `:${lineNumber}` : ""}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={closeExpandedModal}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            aria-label="Close expanded code suggestion editor"
          >
            ×
          </button>
        </div>

        <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
          <section className={editorPaneClassName} aria-label="Original code">
            <div className="border-b border-status-error/20 bg-status-error/8 px-3 py-2">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-diff-remove-text">
                Original
              </span>
            </div>
            <pre
              className={cn(
                codeBlockClassName,
                "overflow-x-auto whitespace-pre-wrap break-words text-text-secondary"
              )}
            >
              <code>{getOriginalCodeValue(originalCode)}</code>
            </pre>
          </section>

          <section className={editorPaneClassName} aria-label="Suggested code">
            <div className="border-b border-status-success/20 bg-status-success/8 px-3 py-2">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-diff-add-text">
                Suggested
              </span>
            </div>
            <textarea
              ref={expandedTextareaRef}
              value={expandedValue}
              onChange={handleExpandedChange}
              onKeyDown={handleExpandedKeyDown}
              rows={10}
              spellCheck={false}
              placeholder="Write the suggested replacement…"
              className={cn(
                codeBlockClassName,
                "resize-none overflow-y-auto placeholder:text-text-tertiary/70 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30"
              )}
              aria-label="Suggested replacement code in expanded editor"
            />
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={closeExpandedModal}
            className="rounded-md px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
          >
            Apply
          </button>
        </div>
      </dialog>
    </>
  );
};
