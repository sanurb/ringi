import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import { useRingiTheme } from "@/components/providers/ringi-theme-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RINGI_PALETTES } from "@/lib/theme/palettes";
import type { PaletteId } from "@/lib/theme/palettes";
import type { AppearanceMode } from "@/lib/theme/preferences-storage";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "theme", label: "Theme" },
  { id: "shortcuts", label: "Shortcuts" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const APPEARANCE_MODES: {
  id: AppearanceMode;
  label: string;
  icon: typeof MoonIcon;
}[] = [
  { icon: MoonIcon, id: "dark", label: "Dark" },
  { icon: SunIcon, id: "light", label: "Light" },
  { icon: MonitorIcon, id: "system", label: "System" },
];

const SHORTCUT_ROWS: { keys: string; description: string }[] = [
  { description: "Toggle Todos panel", keys: "T" },
  { description: "Show keyboard shortcuts (console)", keys: "Shift + ?" },
  { description: "New review (Changes / Reviews)", keys: "N" },
  { description: "Go to Reviews (Changes)", keys: "R" },
  { description: "Go to Changes (Reviews)", keys: "C" },
];

const SettingsNav = ({
  active,
  onNavClick,
}: {
  active: SectionId;
  onNavClick: React.MouseEventHandler<HTMLElement>;
}) => {
  const navId = useId();
  return (
    <nav
      aria-labelledby={navId}
      className="flex w-full flex-col gap-0.5 border-border-subtle border-b p-2 md:w-44 md:border-r md:border-b-0 md:p-3"
      onClick={onNavClick}
    >
      <p className="sr-only" id={navId}>
        Settings sections
      </p>
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-current={active === s.id ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-2 text-left text-xs transition-[background-color,color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.99] motion-reduce:transform-none",
            active === s.id
              ? "bg-accent-muted font-medium text-text-primary"
              : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary"
          )}
          data-ringi-settings-section={s.id}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
};

const AppearanceModeControl = ({
  onAppearanceClick,
  value,
}: {
  onAppearanceClick: React.MouseEventHandler<HTMLDivElement>;
  value: AppearanceMode;
}) => {
  const groupLabelId = useId();
  return (
    <div className="space-y-2">
      <p
        className="text-[0.65rem] font-medium text-text-tertiary uppercase tracking-widest"
        id={groupLabelId}
      >
        Mode
      </p>
      <div
        aria-labelledby={groupLabelId}
        className="inline-flex rounded-lg border border-border-default bg-surface-inset p-0.5"
        onClick={onAppearanceClick}
        role="radiogroup"
      >
        {APPEARANCE_MODES.map((m) => {
          const Icon = m.icon;
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-[background-color,color,transform,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.98] motion-reduce:transform-none",
                selected
                  ? "bg-accent-primary text-white shadow-sm"
                  : "text-text-tertiary hover:bg-surface-overlay hover:text-text-secondary"
              )}
              data-ringi-appearance={m.id}
            >
              <Icon aria-hidden className="size-3.5 opacity-90" />
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const PaletteGrid = ({
  onPaletteValueChange,
  value,
}: {
  onPaletteValueChange: (next: string) => void;
  value: PaletteId;
}) => {
  const labelId = useId();
  return (
    <div className="space-y-2">
      <p
        className="text-[0.65rem] font-medium text-text-tertiary uppercase tracking-widest"
        id={labelId}
      >
        Theme
      </p>
      <RadioGroupPrimitive.Root
        aria-labelledby={labelId}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        onValueChange={onPaletteValueChange}
        value={value}
      >
        {RINGI_PALETTES.map((p) => {
          const selected = value === p.id;
          return (
            <RadioGroupPrimitive.Item
              key={p.id}
              value={p.id}
              className={cn(
                "group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl border px-3 py-2.5 text-left outline-none transition-[border-color,transform,box-shadow,background-color] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99] motion-reduce:transform-none",
                selected
                  ? "border-accent-primary bg-surface-overlay shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent-primary)_35%,transparent)]"
                  : "border-border-default bg-surface-inset/40 hover:border-border-strong hover:bg-surface-overlay/80"
              )}
            >
              <div className="flex items-center gap-1.5" aria-hidden>
                {p.swatches.map((hex) => (
                  <span
                    key={hex}
                    className="size-2.5 rounded-full border border-border-subtle shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-text-primary">
                {p.label}
              </span>
              <span className="text-[0.7rem] text-text-tertiary leading-snug">
                {p.description}
              </span>
              <span
                className={cn(
                  "absolute right-2.5 bottom-2.5 flex size-5 items-center justify-center rounded-full border border-border-default bg-surface-elevated transition-[opacity,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none",
                  selected
                    ? "scale-100 border-accent-primary/40 text-accent-primary opacity-100"
                    : "scale-90 opacity-0 group-focus-visible:opacity-100"
                )}
              >
                <CheckIcon className="size-3" />
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
};

const PanelGeneral = () => (
  <div className="space-y-4 px-5 py-4">
    <div>
      <h3 className="text-sm font-medium text-text-primary">About</h3>
      <p className="mt-1 text-xs text-text-secondary leading-relaxed">
        Ringi is a local-first review workbench for AI-assisted changes.
        Preferences stay on this device.
      </p>
    </div>
    <dl className="grid gap-2 text-xs">
      <div className="flex justify-between gap-4 border-border-subtle border-b pb-2">
        <dt className="text-text-tertiary">Product</dt>
        <dd className="font-medium text-text-primary">ringi</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-text-tertiary">Channel</dt>
        <dd className="text-text-secondary">v0.1</dd>
      </div>
    </dl>
  </div>
);

const PanelShortcuts = () => (
  <div className="px-5 py-4">
    <p className="mb-3 text-xs text-text-secondary">
      Global shortcuts (when focus is not in an input).
    </p>
    <ul className="space-y-2">
      {SHORTCUT_ROWS.map((row) => (
        <li
          key={row.description}
          className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-inset/30 px-3 py-2"
        >
          <span className="text-xs text-text-secondary">{row.description}</span>
          <kbd className="shrink-0 rounded border border-border-default bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.65rem] text-text-tertiary">
            {row.keys}
          </kbd>
        </li>
      ))}
    </ul>
  </div>
);

export interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsModal = ({ onOpenChange, open }: SettingsModalProps) => {
  const { appearance, palette, setAppearance, setPalette } = useRingiTheme();
  const [section, setSection] = useState<SectionId>("theme");
  const prevOpen = useRef(open);

  const onNavClick = useEffectEvent((e: React.MouseEvent<HTMLElement>) => {
    const t = (e.target as HTMLElement).closest(
      "[data-ringi-settings-section]"
    );
    const raw = t?.dataset.ringiSettingsSection;
    if (raw === "general" || raw === "theme" || raw === "shortcuts") {
      setSection(raw);
    }
  });

  const onAppearanceClick = useEffectEvent(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest("[data-ringi-appearance]");
      const m = el?.dataset.ringiAppearance;
      if (m === "dark" || m === "light" || m === "system") {
        setAppearance(m);
      }
    }
  );

  const onPaletteValueChange = useEffectEvent((v: string) => {
    if (v) {
      setPalette(v as PaletteId);
    }
  });

  useEffect(() => {
    if (open && !prevOpen.current) {
      setSection("theme");
    }
    prevOpen.current = open;
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden border-border-default bg-surface-secondary p-0 sm:max-w-3xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Appearance, theme palette, and keyboard shortcuts for Ringi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
          <SettingsNav active={section} onNavClick={onNavClick} />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {section === "general" ? <PanelGeneral /> : null}
            {section === "theme" ? (
              <div className="space-y-8 px-5 py-4">
                <AppearanceModeControl
                  onAppearanceClick={onAppearanceClick}
                  value={appearance}
                />
                <PaletteGrid
                  onPaletteValueChange={onPaletteValueChange}
                  value={palette}
                />
              </div>
            ) : null}
            {section === "shortcuts" ? <PanelShortcuts /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
