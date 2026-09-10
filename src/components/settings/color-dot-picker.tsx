"use client";

import { useQuery } from "@tanstack/react-query";
import { Palette } from "lucide-react";
import { getSettings } from "@/lib/api";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";
import { cn } from "@/lib/utils";

interface ColorDotPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}

/**
 * The workspace palette as a row of dots plus a native picker for anything
 * else. Small enough to sit inline in a settings row.
 */
export function ColorDotPicker({
  value,
  onChange,
  disabled,
  size = "sm",
}: ColorDotPickerProps) {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });
  const palette = settingsQuery.data?.categoryPalette ?? [...CATEGORY_COLOR_PALETTE];
  const dot = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {palette.map((color) => (
        <button
          key={color}
          type="button"
          disabled={disabled}
          onClick={() => onChange(color)}
          aria-label={`Use ${color}`}
          className={cn(
            dot,
            "rounded-full border transition-transform hover:scale-110 disabled:opacity-50",
            value.toLowerCase() === color.toLowerCase()
              ? "border-foreground ring-2 ring-foreground/30"
              : "border-border"
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      <label
        title="Custom color"
        className={cn(
          dot,
          "relative inline-flex cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground"
        )}
      >
        <Palette className="h-3 w-3" />
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
