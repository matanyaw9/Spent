"use client";

import { useEffect, useMemo, useState } from "react";
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
  TransactionFilterBar,
  EMPTY_ADVANCED_FILTERS,
  countActiveAdvancedFilters,
  type AdvancedFilters,
} from "./transaction-filter-bar";
import {
  bulkUpdateTransactions,
  getCategories,
  getTransactions,
  getTransactionsSummary,
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
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<TransactionKindFilter>("all");
  const [sortField, setSortField] = useState<TransactionSortField>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(
    EMPTY_ADVANCED_FILTERS
  );
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const queryClient = useQueryClient();

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
  const notCountedParam =
    advancedFilters.notCounted === "all"
      ? undefined
      : advancedFilters.notCounted;
  const accountNumbersFilter =
    advancedFilters.accountNumbers.length > 0
      ? advancedFilters.accountNumbers
      : undefined;

  // Changing filters keeps the concrete selection (ids stay valid even
  // when rows scroll out of the current view); only the abstract "all
  // matching" mode is filter-relative and must reset (guarded update
  // during render).
  const filterKey = JSON.stringify([
    from,
    to,
    search,
    categoryFilter,
    kind,
    advancedFilters,
  ]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setAllMatching(false);
  }

  const allCategoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
  });
  const accountsQuery = useQuery({
    queryKey: ["transaction-accounts"],
    queryFn: () => listTransactionAccounts(),
  });
  const cardNicknames = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of accountsQuery.data ?? []) {
      if (account.nickname) map.set(account.accountNumber, account.nickname);
    }
    return map;
  }, [accountsQuery.data]);

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
      page,
      kind,
      sortField,
      sortOrder,
      advancedFilters,
    ],
    queryFn: () =>
      getTransactions({
        from,
        to,
        search: search || undefined,
        categoryIds: expandedCategoryIds,
        limit: 50,
        offset: page * 50,
        kind,
        sort: sortField,
        order: sortOrder,
        notCounted: notCountedParam,
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
    // Clicking outside the table (and outside any portaled popup or the
    // bulk bar) drops the selection, like a mail client. Only the table
    // wrapper, the bulk bar (data-keep-selection), and floating overlays
    // count as inside; everything else on the page clears.
    const KEEP_SELECTOR = [
      "[data-keep-selection]",
      '[data-slot="popover-content"]',
      '[data-slot="dropdown-menu-content"]',
      '[data-slot="dialog-content"]',
      '[data-slot="select-content"]',
      "[role='dialog']",
      "[role='menu']",
      "[role='listbox']",
    ].join(", ");
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(KEEP_SELECTOR)) return;
      setSelectedIds(new Set());
      setAllMatching(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
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
              kind,
              notCounted: notCountedParam,
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
      // The selection stays: labeling a batch and then excluding it (or
      // fixing its kind) is a natural two-step flow.
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

        <div data-keep-selection>
        <TransactionsTable
          transactions={transactionsQuery.data?.transactions ?? []}
          total={transactionsQuery.data?.total ?? 0}
          loading={tableInitialLoading}
          filtersActive={
            categoryFilter.length > 0 ||
            kind !== "all" ||
            countActiveAdvancedFilters(advancedFilters) > 0
          }
          headerSlot={<AddTransactionDialog />}
          filterSlot={
            <TransactionFilterBar
              kind={kind}
              onKindChange={(next) => {
                setKind(next);
                setPage(0);
              }}
              value={advancedFilters}
              onChange={(next) => {
                setAdvancedFilters(next);
                setPage(0);
              }}
              accounts={accountsQuery.data ?? []}
              categories={allCategoriesQuery.data ?? []}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={(ids) => {
                setCategoryFilter(ids);
                setPage(0);
              }}
            />
          }
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
          page={page}
          onPageChange={setPage}
          selectedIds={selectedIds}
          allMatching={allMatching}
          onSelectRows={handleSelectRows}
          onSelectAllMatching={() => setAllMatching(true)}
          onClearSelection={clearSelection}
          notCounted={summaryQuery.data?.notCounted}
          duplicates={summaryQuery.data?.duplicates}
          notCountedOnly={advancedFilters.notCounted === "only"}
          onNotCountedOnlyChange={(value) => {
            setAdvancedFilters((prev) => ({
              ...prev,
              notCounted: value ? "only" : "hidden",
            }));
            setPage(0);
          }}
          cardNicknames={cardNicknames}
        />
        </div>
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
