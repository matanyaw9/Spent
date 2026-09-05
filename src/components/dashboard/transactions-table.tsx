"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal,
  HelpCircle,
  Check,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  EyeOff,
  Eye,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  updateTransactionCategory,
  setTransactionKind,
  approveTransactionCategory,
  deleteTransaction,
  setTransactionExcluded,
  type TransactionsSummary,
} from "@/lib/api";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { toast } from "sonner";
import { translateCategoryName } from "@/lib/i18n-data";
import { categoryEmoji } from "@/lib/category-emoji";
import { TransactionSourceCell } from "@/components/transactions/transaction-source-cell";
import { SortableTableHead } from "@/components/transactions/sortable-table-head";
import type { SortOrder, TransactionSortField } from "@/lib/transaction-sort";
import { cn } from "@/lib/utils";
import type { TransactionWithCategory } from "@/lib/types";
import type { Locale } from "@/i18n/routing";

type Kind = "expense" | "income" | "transfer";

interface TransactionsTableProps {
  transactions: TransactionWithCategory[];
  total: number;
  loading: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  /** True when any filter beyond the free-text search is active. */
  filtersActive: boolean;
  /** Filter and add controls, rendered next to the search box. */
  headerSlot?: React.ReactNode;
  /** Removable active-filter chips, rendered under the header row. */
  chipsSlot?: React.ReactNode;
  page: number;
  onPageChange: (page: number) => void;
  sortField: TransactionSortField;
  sortOrder: SortOrder;
  onSortChange: (field: TransactionSortField) => void;
  isFetching?: boolean;
  selectedIds: Set<number>;
  /** "Select all N matching" mode: every filtered row counts as selected. */
  allMatching: boolean;
  onSelectRows: (ids: number[], selected: boolean) => void;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
  notCounted?: TransactionsSummary["notCounted"];
  notCountedOnly: boolean;
  onNotCountedOnlyChange: (value: boolean) => void;
}

const PAGE_SIZE = 50;

export function TransactionsTable({
  transactions,
  total,
  loading,
  search,
  onSearchChange,
  filtersActive,
  headerSlot,
  chipsSlot,
  page,
  onPageChange,
  sortField,
  sortOrder,
  onSortChange,
  isFetching = false,
  selectedIds,
  allMatching,
  onSelectRows,
  onSelectAllMatching,
  onClearSelection,
  notCounted,
  notCountedOnly,
  onNotCountedOnlyChange,
}: TransactionsTableProps) {
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const lastClickedIndexRef = useRef<number | null>(null);

  const isRowSelected = (id: number) => allMatching || selectedIds.has(id);
  const pageIds = transactions.map((txn) => txn.id);
  const selectedOnPage = pageIds.filter(isRowSelected).length;
  const headerState: boolean | "indeterminate" =
    selectedOnPage === 0
      ? false
      : selectedOnPage === pageIds.length
        ? true
        : "indeterminate";

  const handleHeaderCheckbox = () => {
    lastClickedIndexRef.current = null;
    if (headerState === true) {
      onClearSelection();
    } else {
      onSelectRows(pageIds, true);
    }
  };

  const applySelectionClick = (index: number, shiftKey: boolean) => {
    const txn = transactions[index];
    const nextSelected = !isRowSelected(txn.id);
    if (shiftKey && lastClickedIndexRef.current != null) {
      const start = Math.min(lastClickedIndexRef.current, index);
      const end = Math.max(lastClickedIndexRef.current, index);
      onSelectRows(
        transactions.slice(start, end + 1).map((row) => row.id),
        nextSelected
      );
    } else {
      onSelectRows([txn.id], nextSelected);
    }
    lastClickedIndexRef.current = index;
  };

  const handleRowCheckbox = (
    index: number,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    applySelectionClick(index, event.shiftKey);
  };

  const hasSelectionActive = allMatching || selectedIds.size > 0;

  // Outlook-style: once a selection exists (or with Ctrl/Shift held), a
  // click anywhere on the row toggles it; clicks on the row's own controls
  // keep their meaning.
  const handleRowBackgroundClick = (
    index: number,
    event: React.MouseEvent<HTMLTableRowElement>
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, [role='menu']")) return;
    if (
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      hasSelectionActive
    ) {
      applySelectionClick(index, event.shiftKey);
    }
  };

  const otherKinds: Record<Kind, Array<{ value: Kind; label: string }>> = {
    expense: [
      { value: "income", label: t("markAsIncome") },
      { value: "transfer", label: t("markAsTransfer") },
    ],
    income: [
      { value: "expense", label: t("markAsExpense") },
      { value: "transfer", label: t("markAsTransfer") },
    ],
    transfer: [
      { value: "expense", label: t("markAsExpense") },
      { value: "income", label: t("markAsIncome") },
    ],
  };

  const handleCategoryChange = async (txnId: number, categoryId: number) => {
    setUpdatingId(txnId);
    try {
      await updateTransactionCategory(txnId, categoryId);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleKindChange = async (txnId: number, next: Kind) => {
    setUpdatingId(txnId);
    try {
      await setTransactionKind(txnId, next);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleApprove = async (txnId: number) => {
    setUpdatingId(txnId);
    try {
      await approveTransactionCategory(txnId);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    } finally {
      setUpdatingId(null);
    }
  };

  const invalidateAfterExclude = () => {
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["excluded-merchants"] });
  };

  const handleDelete = async (txn: TransactionWithCategory) => {
    setUpdatingId(txn.id);
    try {
      await deleteTransaction(txn.id);
      invalidateAfterExclude();
      toast.success(t("deleteEntryToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleExcludeToggle = async (
    txn: TransactionWithCategory,
    alwaysForMerchant = false,
  ) => {
    const nextExcluded = !txn.isExcluded;
    setUpdatingId(txn.id);
    try {
      await setTransactionExcluded(txn.id, nextExcluded, alwaysForMerchant);
      invalidateAfterExclude();
      if (nextExcluded) {
        toast.success(
          alwaysForMerchant
            ? t("excludeMerchantToast", { merchant: txn.description })
            : t("excludeToast"),
        );
      } else {
        toast.success(t("includeToast"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card className="rounded-2xl border border-border bg-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="font-serif text-2xl font-normal">
            {t("pageTitle")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("search")}
              value={search}
              onChange={(e) => {
                onSearchChange(e.target.value);
                onPageChange(0);
              }}
              className="h-8 w-[200px]"
            />
            {headerSlot}
          </div>
        </div>
        {chipsSlot}
        {filtersActive || search.trim().length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("filterScopedToList")}
          </p>
        ) : null}
      </CardHeader>
      <CardContent
        className={cn(
          isFetching &&
            !loading &&
            "opacity-60 transition-opacity duration-200"
        )}
      >
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {search || filtersActive || notCountedOnly
              ? t("emptyWithFilters")
              : t("emptyNoData")}
          </div>
        ) : (
          <>
            {headerState === true && total > transactions.length && (
              <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {allMatching ? (
                  <>
                    <span>{t("bulkAllMatchingSelected", { total })}</span>
                    <button
                      type="button"
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                      onClick={onClearSelection}
                    >
                      {t("bulkClearSelection")}
                    </button>
                  </>
                ) : (
                  <>
                    <span>
                      {t("bulkPageSelected", { count: transactions.length })}
                    </span>
                    <button
                      type="button"
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                      onClick={onSelectAllMatching}
                    >
                      {t("bulkSelectAllMatching", { total })}
                    </button>
                  </>
                )}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36px]">
                    <Checkbox
                      checked={headerState}
                      onClick={handleHeaderCheckbox}
                      aria-label={t("bulkSelectAllOnPage")}
                    />
                  </TableHead>
                  <TableHead className="w-[32px]" />
                  <SortableTableHead
                    label={t("headerDate")}
                    field="date"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="w-[100px]"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerDescription")}
                    field="description"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerCategory")}
                    field="category_name"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="w-[150px]"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerAccount")}
                    field="account"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="hidden w-[130px] md:table-cell"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <SortableTableHead
                    label={t("headerAmount")}
                    field="charged_amount"
                    activeField={sortField}
                    activeOrder={sortOrder}
                    onSort={onSortChange}
                    className="w-[120px]"
                    align="end"
                    sortAscLabel={t("sortAsc")}
                    sortDescLabel={t("sortDesc")}
                  />
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn, index) => {
                  const isIncome = txn.chargedAmount > 0;
                  const isTransfer = txn.kind === "transfer";
                  const notCountedRow = txn.isExcluded || isTransfer;
                  const selected = isRowSelected(txn.id);
                  const directionColor = isIncome
                    ? "var(--status-on-track)"
                    : "var(--status-over)";
                  const categoryKind: "expense" | "income" =
                    txn.kind === "income" || txn.kind === "expense"
                      ? txn.kind
                      : isIncome
                        ? "income"
                        : "expense";
                  const categoryName = txn.categoryName
                    ? translateCategoryName(txn.categoryName, tCat)
                    : t("rowUncategorized");
                  return (
                    <TableRow
                      key={txn.id}
                      onClick={(e) => handleRowBackgroundClick(index, e)}
                      className={cn(
                        "transition-colors duration-200 hover:bg-muted/50",
                        notCountedRow && "opacity-50",
                        selected && "bg-accent/40 hover:bg-accent/50",
                        hasSelectionActive && "select-none",
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected}
                          onClick={(e) => handleRowCheckbox(index, e)}
                          aria-label={t("bulkSelectRow")}
                        />
                      </TableCell>
                      <TableCell>
                        {isTransfer ? (
                          <div className="text-muted-foreground">
                            <ArrowLeftRight className="h-4 w-4" />
                          </div>
                        ) : (
                          <div style={{ color: directionColor }}>
                            {isIncome ? (
                              <ArrowUpRight className="h-4 w-4" />
                            ) : (
                              <ArrowDownRight className="h-4 w-4" />
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {formatDate(txn.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{txn.description}</div>
                          {txn.needsReview && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{
                                backgroundColor:
                                  "color-mix(in oklch, var(--status-heads-up) 18%, transparent)",
                                color: "var(--status-heads-up)",
                              }}
                              title={
                                txn.aiConfidence != null
                                  ? t("rowReviewTooltipConfidence", { score: txn.aiConfidence })
                                  : t("rowReviewTooltipUnsure")
                              }
                            >
                              <HelpCircle className="h-3 w-3" />
                              {t("rowReview")}
                              {txn.aiConfidence != null && (
                                <span className="ms-0.5 tabular-nums">
                                  {txn.aiConfidence}/7
                                </span>
                              )}
                            </span>
                          )}
                          {txn.isExcluded && (
                            <button
                              type="button"
                              onClick={() => handleExcludeToggle(txn, false)}
                              disabled={updatingId === txn.id}
                              title={t("chipExcludedTooltip")}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <EyeOff className="h-3 w-3" />
                              {t("chipExcluded")}
                            </button>
                          )}
                          {!txn.isExcluded && isTransfer && (
                            <span
                              title={t("chipTransferTooltip")}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              <ArrowLeftRight className="h-3 w-3" />
                              {t("chipTransfer")}
                            </span>
                          )}
                        </div>
                        {txn.memo && (
                          <div className="text-xs text-muted-foreground">
                            {txn.memo}
                          </div>
                        )}
                        {txn.type === "installments" &&
                          txn.installmentNumber &&
                          txn.installmentTotal && (
                            <div className="text-xs text-muted-foreground">
                              {t("rowInstallment", {
                                n: txn.installmentNumber,
                                total: txn.installmentTotal,
                              })}
                            </div>
                          )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <CategoryPicker
                            kinds={[categoryKind]}
                            disabled={updatingId === txn.id}
                            onSelect={(cat) =>
                              handleCategoryChange(txn.id, cat.id)
                            }
                            triggerClassName="inline-flex"
                          >
                            <Badge
                              variant="outline"
                              className="cursor-pointer transition-colors hover:bg-accent"
                              style={
                                txn.categoryColor
                                  ? {
                                      borderColor: txn.categoryColor + "40",
                                      backgroundColor: txn.categoryColor + "15",
                                      color: txn.categoryColor,
                                    }
                                  : undefined
                              }
                            >
                              {categoryEmoji(txn.categoryIcon) && (
                                <span className="me-0.5">
                                  {categoryEmoji(txn.categoryIcon)}
                                </span>
                              )}
                              {categoryName}
                            </Badge>
                          </CategoryPicker>
                          {txn.needsReview && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(txn.id)}
                              disabled={updatingId === txn.id}
                              className="h-6 gap-1 px-2 text-[11px] font-medium"
                              style={{
                                borderColor:
                                  "color-mix(in oklch, var(--status-on-track) 35%, transparent)",
                                color: "var(--status-on-track)",
                              }}
                              title={t("rowApproveTooltip")}
                            >
                              <Check className="h-3 w-3" />
                              {t("rowApprove")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <TransactionSourceCell
                          provider={txn.provider}
                          accountLabel={txn.accountLabel}
                          accountNumber={txn.accountNumber}
                        />
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-end font-medium tabular-nums",
                          notCountedRow && "line-through decoration-1",
                        )}
                        style={{
                          color: notCountedRow
                            ? "var(--muted-foreground)"
                            : directionColor,
                        }}
                      >
                        {formatCurrency(txn.chargedAmount, "ILS", locale)}
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                            disabled={updatingId === txn.id}
                            aria-label={t("rowActions")}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {otherKinds[txn.kind].map((opt) => (
                              <DropdownMenuItem
                                key={opt.value}
                                onClick={() => handleKindChange(txn.id, opt.value)}
                              >
                                {opt.label}
                              </DropdownMenuItem>
                            ))}
                            {txn.provider === "manual" && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(txn)}
                                className="text-destructive"
                              >
                                <Trash2 className="me-2 h-3.5 w-3.5" />
                                {t("deleteEntry")}
                              </DropdownMenuItem>
                            )}
                            {txn.isExcluded ? (
                              <DropdownMenuItem
                                onClick={() => handleExcludeToggle(txn, false)}
                              >
                                <Eye className="me-2 h-3.5 w-3.5" />
                                {t("includeAction")}
                              </DropdownMenuItem>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleExcludeToggle(txn, false)}
                                >
                                  <EyeOff className="me-2 h-3.5 w-3.5" />
                                  {t("excludeAction")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleExcludeToggle(txn, true)}
                                >
                                  <EyeOff className="me-2 h-3.5 w-3.5" />
                                  {t("excludeMerchantAction")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">
                  {t("paginationRange", {
                    from: page * PAGE_SIZE + 1,
                    to: Math.min((page + 1) * PAGE_SIZE, total),
                    total,
                  })}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page === 0}
                  >
                    {t("previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                  >
                    {t("next")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {notCounted && (notCounted.count > 0 || notCountedOnly) && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              {t("notCountedSummary", {
                count: notCounted.count,
                amount: formatCurrency(notCounted.total, "ILS", locale),
              })}
              {" · "}
              {t("notCountedBreakdown", {
                excluded: notCounted.excludedCount,
                transfers: notCounted.transferCount,
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => onNotCountedOnlyChange(!notCountedOnly)}
            >
              {notCountedOnly ? t("notCountedShowAll") : t("notCountedShow")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
