import { createElement, type SVGProps } from "react";
import { iconNodes } from "./icon-nodes";

export type IconName = keyof typeof iconNodes;

/** One SVG registry; decorative icons inherit the accessible name of their control. */
export function Icon({
  name,
  size = 16,
  className = "",
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`ui-icon ${className}`.trim()}
      {...props}
    >
      {iconNodes[name].map(([tag, attributes]) =>
        createElement(tag, attributes)
      )}
    </svg>
  );
}
