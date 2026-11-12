import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useOverlayPosition } from "./overlay-position";
import { TextInput } from "./primitives";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        if (
          ![
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "ArrowDown",
            "Home",
            "End"
          ].includes(event.key)
        )
          return;
        event.preventDefault();
        const current = options.findIndex((option) => option.value === value);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? options.length - 1
              : (current +
                  (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
                  options.length) %
                options.length;
        const option = options[next];
        if (option) {
          onChange(option.value);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>('[role="radio"]')
            .item(next)
            ?.focus();
        }
      }}
    >
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? "selected" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ComboBox({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  useOverlayPosition(open, root, panel, "start", "bottom", true);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  return (
    <div className="combo" ref={root}>
      <TextInput
        ref={input}
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-autocomplete="list"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.min(current + 1, options.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              current < 0 ? options.length - 1 : Math.max(current - 1, 0)
            );
          } else if (open && ["Home", "End"].includes(event.key)) {
            event.preventDefault();
            setActive(event.key === "Home" ? 0 : options.length - 1);
          } else if (event.key === "Enter" && open && active >= 0) {
            event.preventDefault();
            const option = options[active];
            if (option) choose(option);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === "Tab") {
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className={`combo-toggle ${open ? "open" : ""}`}
        aria-label="展开模型列表"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((current) => !current);
          setActive(options.indexOf(value));
          input.current?.focus();
        }}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div
          className="combo-menu ui-menu ui-popover-panel"
          role="listbox"
          aria-label={ariaLabel}
          id={listId}
          ref={panel}
        >
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              id={`${listId}-${index}`}
              tabIndex={-1}
              aria-selected={option === value}
              className={`combo-option ${
                option === value ? "selected" : ""
              } ${index === active ? "active" : ""}`}
              key={option}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option}
              {option === value && (
                <Icon name="check" size={16} className="combo-check" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="switch-row">
      <div className="switch-copy">
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}
