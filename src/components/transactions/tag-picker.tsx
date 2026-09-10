"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, Minus, Plus, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createTag, listTags } from "@/lib/api";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";
import { cn } from "@/lib/utils";
import type { Tag } from "@/lib/types";

interface TagPickerProps {
  /**
   * Tags already on the row (single-row mode). In bulk mode the picker
   * has no idea what the selected rows carry, so leave this undefined and
   * each tag offers both add and remove.
   */
  selectedIds?: number[];
  onToggle: (tag: Tag, add: boolean) => void;
  disabled?: boolean;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  children: React.ReactNode;
}

/**
 * Searchable tag popover with inline creation. Mail-style labels: a row
 * can carry any number, and creating one never leaves the list.
 */
export function TagPicker({
  selectedIds,
  onToggle,
  disabled,
  triggerClassName,
  align = "start",
  side,
  children,
}: TagPickerProps) {
  const t = useTranslations("transactions");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bulk = selectedIds === undefined;

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const tagsQuery = useQuery({
    queryKey: ["tags"],
    queryFn: () => listTags(),
    enabled: open,
  });
  const tags = tagsQuery.data ?? [];
  const trimmed = query.trim();
  const visible = tags.filter(
    (tag) => !trimmed || tag.name.toLowerCase().includes(trimmed.toLowerCase())
  );
  const exactExists = tags.some(
    (tag) => tag.name.toLowerCase() === trimmed.toLowerCase()
  );
  const showCreate = trimmed.length > 0 && tagsQuery.data != null && !exactExists;

  const handleCreate = async () => {
    if (!showCreate || creating) return;
    setCreating(true);
    try {
      const color =
        CATEGORY_COLOR_PALETTE[tags.length % CATEGORY_COLOR_PALETTE.length];
      const tag = await createTag({ name: trimmed, color });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      setQuery("");
      onToggle(tag, true);
      if (!bulk) setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger disabled={disabled} className={triggerClassName}>
        {children}
      </PopoverTrigger>
      <PopoverContent align={align} side={side} className="w-64 p-0">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (showCreate) void handleCreate();
                else if (visible.length === 1 && !bulk) {
                  onToggle(visible[0], !selectedIds.includes(visible[0].id));
                  setOpen(false);
                }
              }
            }}
            placeholder={t("tagSearchPlaceholder")}
            className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {visible.map((tag) => {
            const selected = !bulk && selectedIds.includes(tag.id);
            return (
              <div
                key={tag.id}
                className="flex items-center gap-1 rounded-md px-1 text-sm hover:bg-accent"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (bulk) {
                      onToggle(tag, true);
                    } else {
                      onToggle(tag, !selected);
                    }
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-start"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      selected
                        ? "border-transparent text-white"
                        : "border-input"
                    )}
                    style={selected ? { backgroundColor: tag.color } : undefined}
                  >
                    {selected ? <Check className="h-3 w-3" /> : null}
                    {bulk ? <Plus className="h-3 w-3 text-muted-foreground" /> : null}
                  </span>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate">{tag.name}</span>
                </button>
                {bulk && (
                  <button
                    type="button"
                    onClick={() => onToggle(tag, false)}
                    title={t("tagRemoveFromSelection")}
                    className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
          {showCreate && (
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-accent"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                {t("tagCreate")} <span className="font-medium">&ldquo;{trimmed}&rdquo;</span>
              </span>
            </button>
          )}
          {tagsQuery.data != null && tags.length === 0 && !showCreate && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("tagEmpty")}
            </div>
          )}
        </div>
        <div className="border-t border-border p-1">
          <Link
            href="/settings/tags"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("tagManage")}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
