import { Settings2Icon } from "lucide-react";
import { useEffectEvent, useState } from "react";

import { SettingsModal } from "@/components/settings/settings-modal";
import { cn } from "@/lib/utils";

const motion =
  "transition-[transform,background-color,color,border-color,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transform-none";

export const AppSettingsControl = () => {
  const [open, setOpen] = useState(false);
  const openSettings = useEffectEvent(() => {
    setOpen(true);
  });

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-[5px] text-text-tertiary hover:bg-surface-elevated hover:text-text-secondary active:scale-[0.97]",
          motion
        )}
        title="Settings"
        onClick={openSettings}
      >
        <Settings2Icon aria-hidden className="size-3.5" />
        <span className="sr-only">Open settings</span>
      </button>
      <SettingsModal onOpenChange={setOpen} open={open} />
    </>
  );
};
