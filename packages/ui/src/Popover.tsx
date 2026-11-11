import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { DropdownTrigger } from "./primitives";
import { useOverlayPosition } from "./overlay-position";

/** Outside-click lifecycle adapted from OpenResearch ModelPicker.usePopover (MIT).
 * Adds one shared Escape/focus/keyboard policy for all existing dropdown surfaces. */
export function Popover({
  label,
  children,
  ariaLabel,
  align = "start",
  side = "bottom",
  kind = "menu",
  className = "",
  panelClassName = "",
  triggerClassName = "",
  disabled,
  onOpenChange
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  ariaLabel: string;
  align?: "start" | "end";
  side?: "top" | "bottom";
  kind?: "menu" | "dialog";
  className?: string;
  panelClassName?: string;
  triggerClassName?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const lastOnOpen = useRef(false);
  const onChange = useRef(onOpenChange);
  onChange.current = onOpenChange;
  const id = useId();
  const change = (next: boolean, restore = false) => {
    setOpen(next);
    onChange.current?.(next);
    if (restore) trigger.current?.focus();
  };
  const close = () => change(false, true);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpen(false);
        onChange.current?.(false);
      }
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("focusin", onOutside, true);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("focusin", onOutside, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const active = document.activeElement;
    // Async loading/retry can remove the focused menu item. Keep keyboard
    // ownership inside this open surface rather than leaving focus on body.
    if (
      active !== document.body &&
      active !== trigger.current &&
      active !== panel.current
    )
      return;
    if (kind === "menu") {
      const items = panel.current?.querySelectorAll<HTMLButtonElement>(
        '[role^="menuitem"]:not(:disabled)'
      );
      const item = lastOnOpen.current ? items?.[items.length - 1] : items?.[0];
      (item ?? panel.current)?.focus();
    } else {
      panel.current
        ?.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
        )
        ?.focus();
    }
  });

  useOverlayPosition(open, trigger, panel, align, side);

  return (
    <div
      className={`ui-popover ${className}`.trim()}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (!open || kind !== "menu") return;
        if (event.key === "Tab") {
          change(false, true);
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const items = [
          ...(panel.current?.querySelectorAll<HTMLButtonElement>(
            '[role^="menuitem"]:not(:disabled)'
          ) ?? [])
        ];
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement
        );
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : current < 0
                ? event.key === "ArrowDown"
                  ? 0
                  : items.length - 1
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    items.length) %
                  items.length;
        items[index]?.focus();
      }}
    >
      <DropdownTrigger
        ref={trigger}
        id={`${id}-trigger`}
        className={triggerClassName}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup={kind}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          lastOnOpen.current = false;
          change(!open);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key) && !open) {
            event.preventDefault();
            lastOnOpen.current = event.key === "ArrowUp";
            change(true);
          }
        }}
      >
        {label}
      </DropdownTrigger>
      {open && (
        <div
          ref={panel}
          id={id}
          role={kind}
          aria-label={ariaLabel}
          aria-labelledby={`${id}-trigger`}
          tabIndex={-1}
          data-align={align}
          data-side={side}
          className={`ui-menu ui-popover-panel ${panelClassName}`.trim()}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
