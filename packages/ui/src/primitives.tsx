// Adapted from alphaXiv/OpenResearch ui/{Button,IconButton,MenuItem}.tsx (MIT).
// Fixed source: 92d6423a14b02cc6de85d3e2383dce6cb4dcb7fd; ADR-0020.
// Tailwind declarations are expressed in components.css using the existing token set.
import type { ComponentProps } from "react";
import { Icon } from "./Icon";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "primary" | "ghost" | "danger";
  active?: boolean;
};

export function Button({
  variant = "default",
  active = false,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ${className}`.trim()}
      data-variant={variant}
      data-active={active || undefined}
      {...props}
    />
  );
}

export function IconButton({
  className = "",
  children,
  ...props
}: ButtonProps & { "aria-label": string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={`ui-icon-button ${className}`.trim()}
      {...props}
    >
      {children}
    </Button>
  );
}

export function DropdownTrigger({
  children,
  className = "",
  ...props
}: ComponentProps<"button">) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={`ui-dropdown-trigger ${className}`.trim()}
      {...props}
    >
      {children}
      <Icon name="chevron-down" size={14} className="ui-dropdown-chevron" />
    </Button>
  );
}

export function MenuItem({
  active = false,
  className = "",
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={`ui-menu-item ${className}`.trim()}
      data-active={active || undefined}
      {...props}
    />
  );
}

export function TextInput({
  className = "",
  ...props
}: ComponentProps<"input">) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

export function TextArea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={`ui-input ui-textarea ${className}`.trim()}
      {...props}
    />
  );
}

export function DisclosureSummary({
  className = "",
  children,
  ...props
}: ComponentProps<"summary">) {
  return (
    <summary className={`ui-summary ${className}`.trim()} {...props}>
      <Icon name="chevron-right" size={14} className="ui-disclosure-chevron" />
      {children}
    </summary>
  );
}
