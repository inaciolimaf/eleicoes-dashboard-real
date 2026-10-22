import { ScrollArea } from "@mantine/core";
import type { ReactNode } from "react";

/** Body of a widget: scrolls inside the widget's height, with a thin scrollbar. */
export function ScrollBody({ height, children }: { height: number; children: ReactNode }) {
  return (
    <ScrollArea h={height} type="auto" className="scroll-fino" offsetScrollbars>
      {children}
    </ScrollArea>
  );
}
