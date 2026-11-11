import { useLayoutEffect, type RefObject } from "react";

/** One viewport boundary policy for menus and editable combobox suggestions. */
export function useOverlayPosition(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  align: "start" | "end" = "start",
  side: "top" | "bottom" = "bottom",
  matchWidth = false
) {
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!anchor.current || !panel.current) return;
      const edge = anchor.current.getBoundingClientRect();
      if (matchWidth) panel.current.style.width = `${edge.width}px`;
      const box = panel.current.getBoundingClientRect();
      const left = align === "end" ? edge.right - box.width : edge.left;
      const above = edge.top - box.height - 6;
      const below = edge.bottom + 6;
      const top =
        side === "top"
          ? above >= 12
            ? above
            : below
          : below + box.height <= innerHeight - 12
            ? below
            : above;
      panel.current.style.left = `${Math.max(12, Math.min(left, innerWidth - box.width - 12))}px`;
      panel.current.style.top = `${Math.max(12, Math.min(top, innerHeight - box.height - 12))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    if (anchor.current) observer.observe(anchor.current);
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    };
  }, [open, align, side, matchWidth, anchor, panel]);
}
