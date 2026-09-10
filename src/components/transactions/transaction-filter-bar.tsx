"use client";

import { useTranslations } from "next-intl";
import { CreditCard, EyeOff, Tag as TagIcon, Tags, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { BANK_PROVIDERS, type Category, type Pocket, type Tag } from "@/lib/types";
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
  pocketIds: number[];
  tagIds: number[];
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  notCounted: "hidden",
  amountMin: "",
  amountMax: "",
  dateFrom: "",
  dateTo: "",
  accountNumbers: [],
  pocketIds: [],
  tagIds: [],
};

export function countActiveAdvancedFilters(value: AdvancedFilters): number {
  let count = 0;
  if (value.notCounted !== "hidden") count++;
  if (value.amountMin || value.amountMax) count++;
  if (value.dateFrom || value.dateTo) count++;
  if (value.accountNumbers.length > 0) count++;
  if (value.pocketIds.length > 0) count++;
  if (value.tagIds.length > 0) count++;
  return count;
}

function localDay(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface TransactionFilterBarProps {
  kind: TransactionKindFilter;
  onKindChange: (kind: TransactionKindFilter) => void;
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  accounts: TransactionAccount[];
  categories: Category[];
  pockets: Pocket[];
  tags: Tag[];
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
  pockets,
  tags,
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
            style={{ paddingInlineStart: depth > 0 ? depth * 16 : 0 }}
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

  // --- Pockets and tags ---
  const pocketDisplay = formatMultiFilterDisplay(
    pockets
      .filter((pocket) => value.pocketIds.includes(pocket.id))
      .map((pocket) => pocket.name),
    t("filterAny"),
    (count) => t("filterSelectedCount", { count })
  );
  const tagDisplay = formatMultiFilterDisplay(
    tags.filter((tag) => value.tagIds.includes(tag.id)).map((tag) => tag.name),
    t("filterAny"),
    (count) => t("filterSelectedCount", { count })
  );
  const toggleId = (list: number[], id: number): number[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  // --- Dates ---
  const prefillDates = () => {
    if (value.dateFrom || value.dateTo) return;
    set({ dateFrom: localDay(30), dateTo: localDay(0) });
  };

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

      {pockets.length > 0 && (
        <TransactionMultiFilter
          label={t("filterPocket")}
          icon={Wallet}
          displayValue={pocketDisplay}
          selectAllLabel={t("filterSelectAll")}
          clearLabel={t("filterClearSelection")}
          onSelectAll={() => set({ pocketIds: pockets.map((p) => p.id) })}
          onClear={() => set({ pocketIds: [] })}
        >
          {pockets.map((pocket) => (
            <MultiFilterOption
              key={pocket.id}
              selected={value.pocketIds.includes(pocket.id)}
              onToggle={() =>
                set({ pocketIds: toggleId(value.pocketIds, pocket.id) })
              }
            >
              <div className="flex items-center gap-2">
                <span className="w-4 text-center">{pocket.emoji ?? "•"}</span>
                <span className="truncate">{pocket.name}</span>
              </div>
            </MultiFilterOption>
          ))}
        </TransactionMultiFilter>
      )}

      {tags.length > 0 && (
        <TransactionMultiFilter
          label={t("filterTag")}
          icon={TagIcon}
          displayValue={tagDisplay}
          selectAllLabel={t("filterSelectAll")}
          clearLabel={t("filterClearSelection")}
          onSelectAll={() => set({ tagIds: tags.map((tag) => tag.id) })}
          onClear={() => set({ tagIds: [] })}
        >
          {tags.map((tag) => (
            <MultiFilterOption
              key={tag.id}
              selected={value.tagIds.includes(tag.id)}
              onToggle={() => set({ tagIds: toggleId(value.tagIds, tag.id) })}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="truncate">{tag.name}</span>
              </div>
            </MultiFilterOption>
          ))}
        </TransactionMultiFilter>
      )}

      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          inputMode="decimal"
          placeholder={t("filterAmountMin")}
          aria-label={t("filterAmountMin")}
          value={value.amountMin}
          onChange={(e) => set({ amountMin: e.target.value })}
          className="h-8 w-[5.5rem] text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="number"
          min={0}
          inputMode="decimal"
          placeholder={t("filterAmountMax")}
          aria-label={t("filterAmountMax")}
          value={value.amountMax}
          onChange={(e) => set({ amountMax: e.target.value })}
          className="h-8 w-[5.5rem] text-xs"
        />
      </div>

      <div className="flex items-center gap-1">
        <Input
          type="date"
          aria-label={t("filterDateFrom")}
          value={value.dateFrom}
          onFocus={prefillDates}
          onChange={(e) => set({ dateFrom: e.target.value })}
          className="h-8 w-[8.25rem] text-xs"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          aria-label={t("filterDateTo")}
          value={value.dateTo}
          onFocus={prefillDates}
          onChange={(e) => set({ dateTo: e.target.value })}
          className="h-8 w-[8.25rem] text-xs"
        />
      </div>

      <Select
        value={value.notCounted}
        onValueChange={(v) => {
          if (v === "all" || v === "hidden" || v === "only") {
            set({ notCounted: v });
          }
        }}
      >
        <SelectTrigger
          className="h-8 w-fit gap-1.5 text-xs"
          aria-label={t("filterNotCountedLabel")}
          title={t("filterNotCountedHint")}
        >
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hidden">{t("filterNotCountedHidden")}</SelectItem>
          <SelectItem value="all">{t("filterNotCountedAll")}</SelectItem>
          <SelectItem value="only">{t("filterNotCountedOnly")}</SelectItem>
        </SelectContent>
      </Select>

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
