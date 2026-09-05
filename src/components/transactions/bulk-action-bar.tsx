"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ArrowLeftRight,
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Loader2,
  Tags,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCategories, type BulkTransactionAction } from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import type { Category } from "@/lib/types";

interface BulkActionBarProps {
  /** How many transactions the next action will touch. */
  count: number;
  pending: boolean;
  onAction: (action: BulkTransactionAction) => void;
  onClear: () => void;
}

/**
 * Floating bar shown while transactions are selected. Fixed to the bottom
 * of the viewport so it stays reachable no matter how long the table is.
 */
export function BulkActionBar({
  count,
  pending,
  onAction,
  onClear,
}: BulkActionBarProps) {
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");

  const expenseCategoriesQuery = useQuery({
    queryKey: ["categories", "expense"],
    queryFn: () => getCategories("expense"),
  });
  const incomeCategoriesQuery = useQuery({
    queryKey: ["categories", "income"],
    queryFn: () => getCategories("income"),
  });

  const renderCategoryItems = (categories: Category[]) =>
    categories.map((cat) => (
      <DropdownMenuItem
        key={cat.id}
        onClick={() => onAction({ type: "category", categoryId: cat.id })}
      >
        <div
          className="me-2 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: cat.color }}
        />
        {translateCategoryName(cat.name, tCat)}
      </DropdownMenuItem>
    ));

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg">
        <span className="px-3 text-sm font-medium tabular-nums">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("bulkSelectedCount", { count })
          )}
        </span>
        <div className="h-5 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Tags className="h-3.5 w-3.5" />
            {t("bulkCategorize")}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            side="top"
            className="max-h-80 overflow-y-auto"
          >
            <DropdownMenuLabel>{t("filterExpenses")}</DropdownMenuLabel>
            {renderCategoryItems(expenseCategoriesQuery.data ?? [])}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("filterIncome")}</DropdownMenuLabel>
            {renderCategoryItems(incomeCategoriesQuery.data ?? [])}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {t("bulkSetKind")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top">
            <DropdownMenuItem
              onClick={() => onAction({ type: "kind", kind: "expense" })}
            >
              <ArrowDownRight className="me-2 h-3.5 w-3.5" />
              {t("markAsExpense")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction({ type: "kind", kind: "income" })}
            >
              <ArrowUpRight className="me-2 h-3.5 w-3.5" />
              {t("markAsIncome")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction({ type: "kind", kind: "transfer" })}
            >
              <ArrowLeftRight className="me-2 h-3.5 w-3.5" />
              {t("markAsTransfer")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => onAction({ type: "exclude", excluded: true })}
          className="h-8 gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground"
        >
          <EyeOff className="h-3.5 w-3.5" />
          {t("bulkExclude")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => onAction({ type: "exclude", excluded: false })}
          className="h-8 gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
          {t("bulkInclude")}
        </Button>

        <div className="h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onClear}
          aria-label={t("bulkClearSelection")}
          title={t("bulkClearSelection")}
          className="h-8 w-8 rounded-full p-0 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
