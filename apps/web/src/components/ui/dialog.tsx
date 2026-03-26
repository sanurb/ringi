import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Dialog = (props: ComponentProps<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root data-slot="dialog" {...props} />
);

const DialogTrigger = (
  props: ComponentProps<typeof DialogPrimitive.Trigger>
) => <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;

const DialogPortal = (props: ComponentProps<typeof DialogPrimitive.Portal>) => (
  <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
);

const DialogClose = (props: ComponentProps<typeof DialogPrimitive.Close>) => (
  <DialogPrimitive.Close data-slot="dialog-close" {...props} />
);

const DialogOverlay = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px] transition-opacity duration-200 data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-reduce:transition-none",
      className
    )}
    data-slot="dialog-overlay"
    {...props}
  />
);

const DialogContent = ({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn(
        "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border-default bg-surface-secondary p-0 text-text-primary shadow-lg outline-none transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:scale-[0.98] data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100 motion-reduce:transition-none sm:max-w-lg",
        className
      )}
      data-slot="dialog-content"
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close
          className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-lg text-text-tertiary transition-[color,transform,background-color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-surface-overlay hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.96] motion-reduce:transform-none"
          type="button"
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  </DialogPortal>
);

const DialogHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "flex flex-col gap-1 border-b border-border-subtle px-5 py-4 text-left",
      className
    )}
    data-slot="dialog-header"
    {...props}
  />
);

const DialogFooter = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 border-t border-border-subtle px-5 py-4 sm:flex-row sm:justify-end",
      className
    )}
    data-slot="dialog-footer"
    {...props}
  />
);

const DialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    className={cn("text-base font-semibold tracking-tight", className)}
    data-slot="dialog-title"
    {...props}
  />
);

const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="dialog-description"
    {...props}
  />
);

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
