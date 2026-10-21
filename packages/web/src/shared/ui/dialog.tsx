// Adapted from shadcn/ui base-nova. MIT license: ./LICENSE.shadcn.
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "../lib/utils.js";

export function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogContent({
  className,
  overlayClassName,
  ...props
}: DialogPrimitive.Popup.Props & { overlayClassName?: string }) {
  return (
    <DialogPrimitive.Portal data-slot="dialog-portal">
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className={cn("fixed inset-0 z-50 bg-black/60", overlayClassName)}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-4 text-sm text-popover-foreground outline-none",
          className
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle(props: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

export function DialogDescription(props: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" {...props} />;
}
