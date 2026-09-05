"use client";

import { useTranslations } from "next-intl";
import { Check, SlidersHorizontal, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { MultiFilterOption } from "./transaction-multi-filter";
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import {
  isCategoryFilterChecked,
  toggleCategoryFilterSelection,
} from "@/lib/transaction-filters";
import { categoryEmoji } from "@/lib/category-emoji";
import { BANK_PROVIDERS, type Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import type { TransactionAccount } from "@/lib/api";

export interface AdvancedFilters {
  /** null shows both included and excluded rows. */
  excluded: "hide" | "only" | null;
  /** Raw input strings; empty means unset. */
  amountMin: string;
  amountMax: string;
  /** Empty means "follow the month selector". */
  dateFrom: string;
  dateTo: string;
  accountNumbers: string[];
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  excluded: null,
  amountMin: "",
  amountMax: "",
  dateFrom: "",
  dateTo: "",
  accountNumbers: [],
};

export function countActiveAdvancedFilters(value: AdvancedFilters): number {
  let count = 0;
  if (value.excluded != null) count++;
  if (value.amountMin || value.amountMax) count++;
  if (value.dateFrom || value.dateTo) count++;
  if (value.accountNumbers.length > 0) count++;
  return count;
}

interface TransactionFiltersPopoverProps {
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  accounts: TransactionAccount[];
  categories: Category[];
  categoryFilter: number[];
  onCategoryFilterChange: (categoryIds: number[]) => void;
}

export function TransactionFiltersPopover({
  value,
  onChange,
  accounts,
  categories,
  categoryFilter,
  onCategoryFilterChange,
}: TransactionFiltersPopoverProps) {
  const t = useTranslations("transactions");
  const tBanks = useTranslations("banks");
  const tCat = useTranslations("categoriesSeeded");
  const activeCount =
    countActiveAdvancedFilters(value) + (categoryFilter.length > 0 ? 1 : 0);

  const renderCategoryOptions = (
    parentId: number | null,
    depth: number
  ): React.ReactNode[] => {
    const items = categories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const nodes: React.ReactNode[] = [];
    for (const cat of items) {
      const hasChildren = categories.some((c) => c.parentId === cat.id);
      nodes.push(
        <MultiFilterOption
          key={cat.id}
          selected={isCategoryFilterChecked(cat.id, categoryFilter, categories)}
          onToggle={() =>
            onCategoryFilterChange(
              toggleCategoryFilterSelection(categoryFilter, cat.id, categories)
            )
          }
        >
          <div
            className={cn(
              "flex items-center gap-2",
              hasChildren && "font-semibold"
            )}
            style={{ paddingInlineStart: depth > 0 ? depth * 12 : 0 }}
          >
            <div
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: cat.color }}
            />
            {categoryEmoji(cat.icon) && (
              <span className="-me-1">{categoryEmoji(cat.icon)}</span>
            )}
            {translateCategoryName(cat.name, tCat)}
          </div>
        </MultiFilterOption>
      );
      nodes.push(...renderCategoryOptions(cat.id, depth + 1));
    }
    return nodes;
  };

  const set = (patch: Partial<AdvancedFilters>) =>
    onChange({ ...value, ...patch });

  const excludedOptions: {
    key: "all" | "hide" | "only";
    filterValue: "hide" | "only" | null;
    label: string;
  }[] = [
    { key: "all", filterValue: null, label: t("filterExcludedAll") },
    { key: "hide", filterValue: "hide", label: t("filterExcludedHide") },
    { key: "only", filterValue: "only", label: t("filterExcludedOnly") },
  ];

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {t("filtersButton")}
        {activeCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold tabular-nums text-background">
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4 p-4">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-foreground/80">
            {t("filterCategory")}
          </div>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 p-1">
            {renderCategoryOptions(null, 0)}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-foreground/80">
            {t("filterExcludedLabel")}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-0.5">
            {excludedOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => set({ excluded: opt.filterValue })}
                className={cn(
                  "flex-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                  value.excluded === opt.filterValue
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-foreground/80">
            {t("filterAmountLabel")}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              placeholder={t("filterAmountMin")}
              value={value.amountMin}
              onChange={(e) => set({ amountMin: e.target.value })}
              className="h-8"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              placeholder={t("filterAmountMax")}
              value={value.amountMax}
              onChange={(e) => set({ amountMax: e.target.value })}
              className="h-8"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-foreground/80">
            {t("filterDatesLabel")}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={value.dateFrom}
              onChange={(e) => set({ dateFrom: e.target.value })}
              className="h-8"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <Input
              type="date"
              value={value.dateTo}
              onChange={(e) => set({ dateTo: e.target.value })}
              className="h-8"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("filterDatesHint")}
          </p>
        </div>

        {accounts.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-foreground/80">
              {t("filterCardLabel")}
            </div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {accounts.map((account) => {
                const info = BANK_PROVIDERS.find(
                  (b) => b.id === account.provider
                );
                const providerName = translateProviderName(
                  account.provider,
                  info?.name ?? account.provider,
                  tBanks
                );
                const checked = value.accountNumbers.includes(
                  account.accountNumber
                );
                return (
                  <button
                    key={`${account.provider}:${account.accountNumber}`}
                    type="button"
                    onClick={() =>
                      set({
                        accountNumbers: checked
                          ? value.accountNumbers.filter(
                              (a) => a !== account.accountNumber
                            )
                          : [...value.accountNumbers, account.accountNumber],
                      })
                    }
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-start text-sm transition-colors hover:bg-accent"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border",
                        checked
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    {info ? (
                      <ProviderBadge
                        color={info.color}
                        name={providerName}
                        domain={info.domain}
                        size={16}
                        radius={5}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {providerName}
                      <span className="text-muted-foreground">
                        {" · "}
                        {account.accountNumber}
                      </span>
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {account.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeCount > 0 && (
          <div className="flex justify-end border-t border-border pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                onChange(EMPTY_ADVANCED_FILTERS);
                onCategoryFilterChange([]);
              }}
            >
              {t("filterClearAll")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ActiveFilterChipsProps {
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  categories: Category[];
  categoryFilter: number[];
  onCategoryFilterChange: (categoryIds: number[]) => void;
}

function Chip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * The compressed Filters button paired with a spread-out active state:
 * every live filter renders as a removable chip under the table header,
 * so nothing is hidden but the header never crowds.
 */
export function ActiveFilterChips({
  value,
  onChange,
  categories,
  categoryFilter,
  onCategoryFilterChange,
}: ActiveFilterChipsProps) {
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");

  // Show only the top-most selected categories: when a parent is selected
  // its children ride along and would just repeat it.
  const categoryChips = categoryFilter
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => c != null)
    .filter((c) => c.parentId == null || !categoryFilter.includes(c.parentId));

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...categoryChips.map((cat) => ({
      key: `cat-${cat.id}`,
      label: [categoryEmoji(cat.icon), translateCategoryName(cat.name, tCat)]
        .filter(Boolean)
        .join(" "),
      onRemove: () =>
        onCategoryFilterChange(
          toggleCategoryFilterSelection(categoryFilter, cat.id, categories)
        ),
    })),
  ];

  if (value.excluded != null) {
    chips.push({
      key: "excluded",
      label:
        value.excluded === "hide"
          ? t("filterExcludedHide")
          : t("filterExcludedOnly"),
      onRemove: () => onChange({ ...value, excluded: null }),
    });
  }
  if (value.amountMin || value.amountMax) {
    const min = value.amountMin ? formatCurrency(Number(value.amountMin)) : "";
    const max = value.amountMax ? formatCurrency(Number(value.amountMax)) : "";
    chips.push({
      key: "amount",
      label: min && max ? `${min} – ${max}` : min ? `≥ ${min}` : `≤ ${max}`,
      onRemove: () => onChange({ ...value, amountMin: "", amountMax: "" }),
    });
  }
  if (value.dateFrom || value.dateTo) {
    chips.push({
      key: "dates",
      label: `${value.dateFrom || "…"} – ${value.dateTo || "…"}`,
      onRemove: () => onChange({ ...value, dateFrom: "", dateTo: "" }),
    });
  }
  for (const account of value.accountNumbers) {
    chips.push({
      key: `acc-${account}`,
      label: account,
      onRemove: () =>
        onChange({
          ...value,
          accountNumbers: value.accountNumbers.filter((a) => a !== account),
        }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => {
            onChange(EMPTY_ADVANCED_FILTERS);
            onCategoryFilterChange([]);
          }}
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("filterClearAll")}
        </button>
      )}
    </div>
  );
}
