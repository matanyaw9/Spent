"use client";

import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked: boolean | "indeterminate";
  /** Receives the raw event so callers can implement shift-click ranges. */
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Checkbox({
  checked,
  onClick,
  disabled,
  className,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const isChecked = checked === true;
  const isIndeterminate = checked === "indeterminate";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isIndeterminate ? "mixed" : isChecked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        isChecked || isIndeterminate
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card hover:border-foreground/40",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      {isIndeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3} />
      ) : isChecked ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : null}
    </button>
  );
}
