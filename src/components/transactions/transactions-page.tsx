"use client";

import { useEffect, useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/app-shell";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { KpiCards } from "./kpi-cards";
import { WidgetsRow } from "./widgets-row";
import { BulkActionBar } from "./bulk-action-bar";
import { AddTransactionDialog } from "./add-transaction-dialog";
import {
  TransactionFiltersPopover,
  EMPTY_ADVANCED_FILTERS,
  type AdvancedFilters,
} from "./transaction-filters-popover";
import {
  bulkUpdateTransactions,
  getCategories,
  getTransactions,
  getTransactionsSummary,
  listIntegrations,
  listTransactionAccounts,
} from "@/lib/api";
import type { BulkTransactionAction, TransactionKindFilter } from "@/lib/api";
import { expandCategoryFilterIds } from "@/lib/transaction-filters";
import {
  nextSortState,
  type SortOrder,
  type TransactionSortField,
} from "@/lib/transaction-sort";
import {
  addMonths,
  formatMonthLabel,
  getMonthRange,
} from "@/lib/formatters";
import type { Locale } from "@/i18n/routing";

export function TransactionsPage() {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number[]>([]);
  const [accountFilter, setAccountFilter] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [notCountedOnly, setNotCountedOnly] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(
    EMPTY_ADVANCED_FILTERS
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const queryClient = useQueryClient();

  const filterOptions: { value: TransactionKindFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "income", label: t("filterIncome") },
    { value: "expense", label: t("filterExpenses") },
  ];

  const monthRange = getMonthRange(selectedDate);
  // Custom dates from the filters popover override the month selector.
  const from = advancedFilters.dateFrom || monthRange.from;
  const to = advancedFilters.dateTo || monthRange.to;

  const parseAmount = (raw: string): number | undefined => {
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const amountMin = parseAmount(advancedFilters.amountMin);
  const amountMax = parseAmount(advancedFilters.amountMax);
  const excludedFilter = advancedFilters.excluded ?? undefined;
  const accountNumbersFilter =
    advancedFilters.accountNumbers.length > 0
      ? advancedFilters.accountNumbers
      : undefined;

  // A selection only makes sense against the filter it was made under, so
  // drop it whenever the filter changes (guarded update during render).
  const filterKey = JSON.stringify([
    from,
    to,
    search,
    categoryFilter,
    accountFilter,
    kind,
    notCountedOnly,
    advancedFilters,
  ]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setSelectedIds(new Set());
    setAllMatching(false);
  }

  const allCategoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const integrationsQuery = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listIntegrations(),
  });
  const accountsQuery = useQuery({
    queryKey: ["transaction-accounts"],
    queryFn: () => listTransactionAccounts(),
  });

  const expandedCategoryIds = expandCategoryFilterIds(
    categoryFilter,
    allCategoriesQuery.data ?? []
  );

  const transactionsQuery = useQuery({
    queryKey: [
      "transactions",
      from,
      to,
      search,
      categoryFilter,
      accountFilter,
      page,
      kind,
      sortField,
      sortOrder,
      notCountedOnly,
      advancedFilters,
    ],
    queryFn: () =>
      getTransactions({
        from,
        to,
        search: search || undefined,
        categoryIds: expandedCategoryIds,
        credentialIds:
          accountFilter.length > 0 ? accountFilter : undefined,
        limit: 50,
        offset: page * 50,
        kind,
        sort: sortField,
        order: sortOrder,
        notCounted: notCountedOnly || undefined,
        excluded: excludedFilter,
        amountMin,
        amountMax,
        accountNumbers: accountNumbersFilter,
      }),
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ["transactions-summary", from, to],
    queryFn: () => getTransactionsSummary({ from, to }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", kind === "income" ? "income" : "expense"],
    queryFn: () =>
      kind === "income" ? getCategories("income") : getCategories("expense"),
  });

  const monthLabel = formatMonthLabel(selectedDate, locale);

  const pageRows = transactionsQuery.data?.transactions ?? [];
  const totalMatching = transactionsQuery.data?.total ?? 0;
  const hasSelection = allMatching || selectedIds.size > 0;
  const bulkCount = allMatching ? totalMatching : selectedIds.size;

  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedIds(new Set());
        setAllMatching(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection]);

  const clearSelection = () => {
    setSelectedIds(new Set());
    setAllMatching(false);
  };

  const handleSelectRows = (ids: number[], selected: boolean) => {
    setSelectedIds((prev) => {
      // Leaving "all matching" mode turns the abstract selection into a
      // concrete one: the visible page minus whatever was just unticked.
      const next = allMatching
        ? new Set(pageRows.map((row) => row.id))
        : new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    if (!selected && allMatching) setAllMatching(false);
  };

  const handleBulkAction = async (action: BulkTransactionAction) => {
    setBulkPending(true);
    try {
      const target = allMatching
        ? {
            filter: {
              from,
              to,
              search: search || undefined,
              categoryIds: expandedCategoryIds?.length
                ? expandedCategoryIds
                : undefined,
              credentialIds:
                accountFilter.length > 0 ? accountFilter : undefined,
              kind,
              notCounted: notCountedOnly || undefined,
              excluded: excludedFilter,
              amountMin,
              amountMax,
              accountNumbers: accountNumbersFilter,
            },
          }
        : { ids: [...selectedIds] };
      const result = await bulkUpdateTransactions(target, action);
      for (const key of [
        "transactions",
        "summary",
        "transactions-summary",
        "categories",
        "home",
        "excluded-merchants",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      if (result.skipped > 0) {
        toast.success(
          t("bulkAppliedPartialToast", {
            updated: result.updated,
            skipped: result.skipped,
          })
        );
      } else {
        toast.success(t("bulkAppliedToast", { count: result.updated }));
      }
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBulkPending(false);
    }
  };

  const summaryInitialLoading =
    summaryQuery.isPending && summaryQuery.data === undefined;
  const tableInitialLoading =
    transactionsQuery.isPending && transactionsQuery.data === undefined;

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        meta={monthLabel}
        actions={
          <PeriodSelector
            label={monthLabel}
            onPrev={() => setSelectedDate((d) => addMonths(d, -1))}
            onNext={() => setSelectedDate((d) => addMonths(d, 1))}
          />
        }
      />

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <AINotConnectedBanner />
        <KpiCards summary={summaryQuery.data} loading={summaryInitialLoading} />

        <WidgetsRow
          summary={summaryQuery.data}
          loading={summaryInitialLoading}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border bg-card p-1 w-fit">
          {filterOptions.map((opt) => {
            const active = kind === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setKind(opt.value);
                  setPage(0);
                  setCategoryFilter([]);
                }}
                className={
                  active
                    ? "rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors"
                    : "rounded-full px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <TransactionFiltersPopover
            value={advancedFilters}
            onChange={(next) => {
              setAdvancedFilters(next);
              setPage(0);
            }}
            accounts={accountsQuery.data ?? []}
          />
          <AddTransactionDialog />
        </div>
        </div>

        <TransactionsTable
          transactions={transactionsQuery.data?.transactions ?? []}
          total={transactionsQuery.data?.total ?? 0}
          categories={categoriesQuery.data ?? []}
          integrations={integrationsQuery.data ?? []}
          loading={tableInitialLoading}
          isFetching={transactionsQuery.isFetching}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={(field) => {
            const next = nextSortState(sortField, sortOrder, field);
            setSortField(next.field);
            setSortOrder(next.order);
            setPage(0);
          }}
          search={search}
          onSearchChange={setSearch}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={(ids) => {
            setCategoryFilter(ids);
            setPage(0);
          }}
          accountFilter={accountFilter}
          onAccountFilterChange={(ids) => {
            setAccountFilter(ids);
            setPage(0);
          }}
          page={page}
          onPageChange={setPage}
          selectedIds={selectedIds}
          allMatching={allMatching}
          onSelectRows={handleSelectRows}
          onSelectAllMatching={() => setAllMatching(true)}
          onClearSelection={clearSelection}
          notCounted={summaryQuery.data?.notCounted}
          notCountedOnly={notCountedOnly}
          onNotCountedOnlyChange={(value) => {
            setNotCountedOnly(value);
            setPage(0);
          }}
        />
      </div>

      {hasSelection && bulkCount > 0 && (
        <BulkActionBar
          count={bulkCount}
          pending={bulkPending}
          onAction={handleBulkAction}
          onClear={clearSelection}
        />
      )}
    </>
  );
}
