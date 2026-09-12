"use client";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryPicker } from "./category-picker";
import type { BulkTransactionAction } from "@/lib/api";

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

  return (
    <div data-keep-selection className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1.5 shadow-lg">
        <span className="px-3 text-sm font-medium tabular-nums">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            t("bulkSelectedCount", { count })
          )}
        </span>
        <div className="h-5 w-px bg-border" />

        <CategoryPicker
          kinds={["expense", "income"]}
          allowUncategorized
          disabled={pending}
          align="center"
          side="top"
          onSelect={(cat) =>
            onAction({ type: "category", categoryId: cat?.id ?? null })
          }
          triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Tags className="h-3.5 w-3.5" />
          {t("bulkCategorize")}
        </CategoryPicker>

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
