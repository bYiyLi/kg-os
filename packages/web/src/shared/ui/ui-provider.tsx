import type { ReactNode } from "react";

import { Toaster } from "./toast.js";
import { TooltipProvider } from "./tooltip.js";

export function UiProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delay={400}>
      <Toaster>{children}</Toaster>
    </TooltipProvider>
  );
}
