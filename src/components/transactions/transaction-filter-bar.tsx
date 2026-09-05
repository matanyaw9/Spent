"use client";

import { useTranslations } from "next-intl";
import {
  Banknote,
  CalendarRange,
  ChevronDown,
  CreditCard,
  EyeOff,
  Tags,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProviderBadge } from "@/components/setup/provider-badge";
import {
  TransactionMultiFilter,
  MultiFilterOption,
} from "./transaction-multi-filter";
import { translateCategoryName, translateProviderName } from "@/lib/i18n-data";
import {
  formatMultiFilterDisplay,
  getCategoryDescendantIds,
  isCategoryFilterChecked,
  toggleCategoryFilterSelection,
} from "@/lib/transaction-filters";
import { categoryEmoji } from "@/lib/category-emoji";
import { formatCurrency } from "@/lib/formatters";
import { BANK_PROVIDERS, type Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { TransactionAccount, TransactionKindFilter } from "@/lib/api";

export interface AdvancedFilters {
  /**
   * Visibility of rows that don't count toward totals (excluded rows and
   * user-marked transfers). Auto-detected card-billing duplicates never
   * show regardless; the server drops them.
   */
  notCounted: "all" | "hidden" | "only";
  /** Raw input strings; empty means unset. */
  amountMin: string;
  amountMax: string;
  /** Empty means "follow the month selector". */
  dateFrom: string;
  dateTo: string;
  accountNumbers: string[];
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  notCounted: "hidden",
  amountMin: "",
  amountMax: "",
  dateFrom: "",
  dateTo: "",
  accountNumbers: [],
};

export function countActiveAdvancedFilters(value: AdvancedFilters): number {
  let count = 0;
  if (value.notCounted !== "hidden") count++;
  if (value.amountMin || value.amountMax) count++;
  if (value.dateFrom || value.dateTo) count++;
  if (value.accountNumbers.length > 0) count++;
  return count;
}

function localDay(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TRIGGER_CLASS =
  "flex h-8 items-center justify-between gap-1 rounded-lg border border-input bg-transparent py-2 pe-2 ps-2.5 text-sm transition-colors outline-none select-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function BarPopover({
  icon: Icon,
  label,
  displayValue,
  active,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  displayValue: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={TRIGGER_CLASS}
        title={`${label}: ${displayValue}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-muted-foreground">: </span>
            <span
              className={cn(
                "font-medium",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {displayValue}
            </span>
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface TransactionFilterBarProps {
  kind: TransactionKindFilter;
  onKindChange: (kind: TransactionKindFilter) => void;
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  accounts: TransactionAccount[];
  categories: Category[];
  categoryFilter: number[];
  onCategoryFilterChange: (categoryIds: number[]) => void;
}

/**
 * All list filters, spread on one line under the table title so nothing
 * hides behind a single "Filters" button. Each control announces its own
 * state in its trigger.
 */
export function TransactionFilterBar({
  kind,
  onKindChange,
  value,
  onChange,
  accounts,
  categories,
  categoryFilter,
  onCategoryFilterChange,
}: TransactionFilterBarProps) {
  const t = useTranslations("transactions");
  const tBanks = useTranslations("banks");
  const tCat = useTranslations("categoriesSeeded");

  const set = (patch: Partial<AdvancedFilters>) =>
    onChange({ ...value, ...patch });

  const kindOptions: { value: TransactionKindFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "income", label: t("filterIncome") },
    { value: "expense", label: t("filterExpenses") },
  ];

  // --- Category ---
  const categoryLabels = categoryFilter
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => c != null)
    .filter((c) => c.parentId == null || !categoryFilter.includes(c.parentId))
    .map((c) => translateCategoryName(c.name, tCat));
  const categoryDisplay = formatMultiFilterDisplay(
    categoryLabels,
    t("filterAny"),
    (count) => t("filterSelectedCount", { count })
  );
  const allCategoryIds = [
    ...new Set(
      categories.flatMap((c) => getCategoryDescendantIds(c.id, categories))
    ),
  ];

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

  // --- Cards ---
  const cardLabel = (account: TransactionAccount): string => {
    const info = BANK_PROVIDERS.find((b) => b.id === account.provider);
    const providerName = translateProviderName(
      account.provider,
      info?.name ?? account.provider,
      tBanks
    );
    return `${account.nickname ?? providerName} · ${account.accountNumber.slice(-4)}`;
  };
  const cardDisplay = formatMultiFilterDisplay(
    accounts
      .filter((a) => value.accountNumbers.includes(a.accountNumber))
      .map(cardLabel),
    t("filterAny"),
    (count) => t("filterSelectedCount", { count })
  );

  // --- Amount ---
  const amountDisplay =
    value.amountMin && value.amountMax
      ? `${formatCurrency(Number(value.amountMin))} – ${formatCurrency(Number(value.amountMax))}`
      : value.amountMin
        ? `≥ ${formatCurrency(Number(value.amountMin))}`
        : value.amountMax
          ? `≤ ${formatCurrency(Number(value.amountMax))}`
          : t("filterAny");

  // --- Dates ---
  const datesActive = Boolean(value.dateFrom || value.dateTo);
  const datesDisplay = datesActive
    ? `${value.dateFrom || "…"} – ${value.dateTo || "…"}`
    : t("filterDatesMonth");
  const prefillDates = () => {
    if (value.dateFrom || value.dateTo) return;
    set({ dateFrom: localDay(30), dateTo: localDay(0) });
  };

  // --- Not counted ---
  const notCountedOptions: {
    filterValue: AdvancedFilters["notCounted"];
    label: string;
  }[] = [
    { filterValue: "hidden", label: t("filterNotCountedHidden") },
    { filterValue: "all", label: t("filterNotCountedAll") },
    { filterValue: "only", label: t("filterNotCountedOnly") },
  ];
  const notCountedDisplay =
    notCountedOptions.find((o) => o.filterValue === value.notCounted)?.label ??
    "";

  const anyActive =
    countActiveAdvancedFilters(value) > 0 ||
    categoryFilter.length > 0 ||
    kind !== "all";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg border border-input p-0.5">
        {kindOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onKindChange(opt.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              kind === opt.value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <TransactionMultiFilter
        label={t("filterCategory")}
        icon={Tags}
        displayValue={categoryDisplay}
        selectAllLabel={t("filterSelectAll")}
        clearLabel={t("filterClearSelection")}
        onSelectAll={() => onCategoryFilterChange(allCategoryIds)}
        onClear={() => onCategoryFilterChange([])}
      >
        {renderCategoryOptions(null, 0)}
      </TransactionMultiFilter>

      {accounts.length > 1 && (
        <TransactionMultiFilter
          label={t("filterCardLabel")}
          icon={CreditCard}
          displayValue={cardDisplay}
          selectAllLabel={t("filterSelectAll")}
          clearLabel={t("filterClearSelection")}
          onSelectAll={() =>
            set({ accountNumbers: accounts.map((a) => a.accountNumber) })
          }
          onClear={() => set({ accountNumbers: [] })}
        >
          {accounts.map((account) => {
            const info = BANK_PROVIDERS.find((b) => b.id === account.provider);
            const checked = value.accountNumbers.includes(
              account.accountNumber
            );
            return (
              <MultiFilterOption
                key={`${account.provider}:${account.accountNumber}`}
                selected={checked}
                onToggle={() =>
                  set({
                    accountNumbers: checked
                      ? value.accountNumbers.filter(
                          (a) => a !== account.accountNumber
                        )
                      : [...value.accountNumbers, account.accountNumber],
                  })
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  {info ? (
                    <ProviderBadge
                      color={info.color}
                      name={cardLabel(account)}
                      domain={info.domain}
                      size={16}
                      radius={5}
                    />
                  ) : null}
                  <span className="truncate">{cardLabel(account)}</span>
                </div>
              </MultiFilterOption>
            );
          })}
        </TransactionMultiFilter>
      )}

      <BarPopover
        icon={Banknote}
        label={t("filterAmountLabel")}
        displayValue={amountDisplay}
        active={Boolean(value.amountMin || value.amountMax)}
      >
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
      </BarPopover>

      <BarPopover
        icon={CalendarRange}
        label={t("filterDatesLabel")}
        displayValue={datesDisplay}
        active={datesActive}
      >
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-10 shrink-0">{t("filterDateFrom")}</span>
          <Input
            type="date"
            value={value.dateFrom}
            onFocus={prefillDates}
            onChange={(e) => set({ dateFrom: e.target.value })}
            className="h-8"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-10 shrink-0">{t("filterDateTo")}</span>
          <Input
            type="date"
            value={value.dateTo}
            onFocus={prefillDates}
            onChange={(e) => set({ dateTo: e.target.value })}
            className="h-8"
          />
        </label>
        <p className="text-[11px] text-muted-foreground">
          {t("filterDatesHint")}
        </p>
      </BarPopover>

      <BarPopover
        icon={EyeOff}
        label={t("filterNotCountedShort")}
        displayValue={notCountedDisplay}
        active={value.notCounted !== "hidden"}
      >
        <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-0.5">
          {notCountedOptions.map((opt) => (
            <button
              key={opt.filterValue}
              type="button"
              onClick={() => set({ notCounted: opt.filterValue })}
              className={cn(
                "flex-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                value.notCounted === opt.filterValue
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("filterNotCountedHint")}
        </p>
      </BarPopover>

      {anyActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => {
            onChange(EMPTY_ADVANCED_FILTERS);
            onCategoryFilterChange([]);
            onKindChange("all");
          }}
        >
          {t("filterClearAll")}
        </Button>
      )}
    </div>
  );
}
