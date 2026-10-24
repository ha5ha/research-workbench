import { useEffect, useId, useRef, useState } from "react";

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
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.value}
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
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="combo" ref={root}>
      <input
        value={value}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        spellCheck={false}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              Math.min(current + 1, options.length - 1)
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && active >= 0) {
            event.preventDefault();
            const option = options[active];
            if (option) choose(option);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <button
        type="button"
        className={`combo-toggle ${open ? "open" : ""}`}
        aria-label="展开模型列表"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path
            d="m1 1 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="combo-menu" role="listbox" id={listId}>
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              className={`combo-option ${
                option === value ? "selected" : ""
              } ${index === active ? "active" : ""}`}
              key={option}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(option)}
            >
              {option}
              {option === value && <span className="combo-check">✓</span>}
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
