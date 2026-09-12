"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { createCategory, getCategories } from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import { categoryEmoji } from "@/lib/category-emoji";
import { cn } from "@/lib/utils";
import type { Category, CategoryKind } from "@/lib/types";

interface CategoryPickerProps {
  /** Which category kinds to offer. One kind for a row, both for bulk. */
  kinds: CategoryKind[];
  /** Offer an "Uncategorized" row that selects null (clears the category). */
  allowUncategorized?: boolean;
  onSelect: (category: Category | null) => void;
  disabled?: boolean;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  children: React.ReactNode;
}

/**
 * Searchable category dropdown with inline creation, so assigning a label
 * never requires a detour through settings.
 */
export function CategoryPicker({
  kinds,
  allowUncategorized = false,
  onSelect,
  disabled,
  triggerClassName,
  align = "start",
  side,
  children,
}: CategoryPickerProps) {
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search field once the popup is positioned. A plain autoFocus
  // fires while the portal still sits at the top of the document and makes
  // the page scroll-jump there.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const expenseQuery = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
    enabled: open && kinds.includes("expense"),
  });
  const incomeQuery = useQuery({
    queryKey: ["categories", "income"],
    queryFn: () => getCategories("income"),
    enabled: open && kinds.includes("income"),
  });

  const listFor = (kind: CategoryKind): Category[] =>
    (kind === "expense" ? expenseQuery.data : incomeQuery.data) ?? [];

  const trimmed = query.trim();
  const matches = (cat: Category): boolean => {
    if (!trimmed) return true;
    const q = trimmed.toLowerCase();
    return (
      cat.name.toLowerCase().includes(q) ||
      translateCategoryName(cat.name, tCat).toLowerCase().includes(q)
    );
  };

  const groups = kinds.map((kind) => ({
    kind,
    label: kind === "expense" ? t("filterExpenses") : t("filterIncome"),
    categories: listFor(kind).filter(matches),
  }));

  const allLoaded = kinds.every((kind) =>
    kind === "expense" ? expenseQuery.data != null : incomeQuery.data != null
  );
  const exactExists = kinds.some((kind) =>
    listFor(kind).some(
      (cat) => cat.name.toLowerCase() === trimmed.toLowerCase()
    )
  );
  const showCreate = trimmed.length > 0 && allLoaded && !exactExists;
  const visibleMatches = groups.flatMap((g) => g.categories);

  const finish = (category: Category | null) => {
    setOpen(false);
    setQuery("");
    onSelect(category);
  };

  const renderRow = (cat: Category, depth: number) => (
    <button
      key={cat.id}
      type="button"
      onClick={() => finish(cat)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-accent"
      style={{ paddingInlineStart: 8 + depth * 16 }}
    >
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: cat.color }}
      />
      <span className="truncate">
        {categoryEmoji(cat.icon) && (
          <span className="me-1">{categoryEmoji(cat.icon)}</span>
        )}
        {translateCategoryName(cat.name, tCat)}
      </span>
    </button>
  );

  // Browsing (no query): the full tree with sub-categories indented under
  // their parents. Searching flattens to matches.
  const renderTree = (
    cats: Category[],
    parentId: number | null,
    depth: number
  ): React.ReactNode[] =>
    cats
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((cat) => [
        renderRow(cat, depth),
        ...renderTree(cats, cat.id, depth + 1),
      ]);

  const handleCreate = async (kind: CategoryKind) => {
    if (creating || !trimmed) return;
    setCreating(true);
    try {
      const created = await createCategory({ name: trimmed, kind });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      finish(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const handleEnter = () => {
    if (visibleMatches.length === 1) {
      finish(visibleMatches[0]);
    } else if (visibleMatches.length === 0 && showCreate) {
      handleCreate(kinds[0]);
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
                handleEnter();
              }
            }}
            placeholder={t("categorySearchPlaceholder")}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {allowUncategorized && !trimmed && (
            <button
              type="button"
              onClick={() => finish(null)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
              <span className="truncate">{t("rowUncategorized")}</span>
            </button>
          )}
          {groups.map((group) => (
            <div key={group.kind}>
              {kinds.length > 1 && group.categories.length > 0 && (
                <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {group.label}
                </div>
              )}
              {trimmed
                ? group.categories.map((cat) => renderRow(cat, 0))
                : renderTree(listFor(group.kind), null, 0)}
            </div>
          ))}
          {visibleMatches.length === 0 && !showCreate && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              {t("categorySearchEmpty")}
            </div>
          )}
          {showCreate &&
            kinds.map((kind) => (
              <button
                key={`create-${kind}`}
                type="button"
                disabled={creating}
                onClick={() => handleCreate(kind)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm font-medium transition-colors hover:bg-accent",
                  creating && "opacity-50"
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {kinds.length > 1
                    ? t("categoryCreateInKind", {
                        name: trimmed,
                        kind:
                          kind === "expense"
                            ? t("filterExpenses")
                            : t("filterIncome"),
                      })
                    : t("categoryCreate", { name: trimmed })}
                </span>
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
