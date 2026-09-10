"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, Minus, PiggyBank } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { TransactionsSummary } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

interface KpiCardsProps {
  summary?: TransactionsSummary;
  loading: boolean;
}

const INCOME_TINT = "color-mix(in oklch, var(--status-on-track) 12%, transparent)";
const EXPENSE_TINT = "color-mix(in oklch, var(--status-over) 12%, transparent)";
const POCKET_TINT = "color-mix(in oklch, var(--status-plenty-left) 16%, transparent)";
const NEUTRAL_TINT = "color-mix(in oklch, var(--muted-foreground) 12%, transparent)";

/**
 * The period in four numbers, all defined by the money model: income,
 * spending, what was left (free cash), and how much of that was put away
 * into pockets (savings, investments, loan repayments).
 */
export function KpiCards({ summary, loading }: KpiCardsProps) {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const flows = summary?.flows;
  const income = flows?.income.total ?? summary?.income.total ?? 0;
  const spending = flows?.spending.total ?? summary?.expense.total ?? 0;
  const incomeCount = flows?.income.count ?? summary?.income.count ?? 0;
  const spendingCount = flows?.spending.count ?? summary?.expense.count ?? 0;
  const freeCash = income - spending;
  const freeCashPositive = freeCash >= 0;
  const putAway =
    (flows?.saving.total ?? 0) +
    (flows?.investing.total ?? 0) +
    (flows?.debtRepayment.total ?? 0);
  const putAwayParts = [
    { key: "saving", total: flows?.saving.total ?? 0 },
    { key: "investing", total: flows?.investing.total ?? 0 },
    { key: "debtRepayment", total: flows?.debtRepayment.total ?? 0 },
  ].filter((part) => part.total > 0);
  const putAwayLabels: Record<string, string> = {
    saving: "Savings",
    investing: "Investments",
    debtRepayment: "Debt",
  };

  const countMeta = (count: number): string => {
    const label = count === 1 ? t("kpiTransactionOne") : t("kpiTransactionOther");
    return `${count} ${label}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={t("kpiIncome")}
        hint={t("kpiIncomeHint")}
        amount={income}
        meta={countMeta(incomeCount)}
        icon={<ArrowUpRight className="h-4 w-4" />}
        color="var(--status-on-track)"
        iconBg={INCOME_TINT}
        loading={loading}
        locale={locale}
      />
      <KpiCard
        label={t("kpiSpending")}
        hint={t("kpiSpendingHint")}
        amount={spending}
        meta={countMeta(spendingCount)}
        icon={<ArrowDownRight className="h-4 w-4" />}
        color="var(--status-over)"
        iconBg={EXPENSE_TINT}
        loading={loading}
        locale={locale}
      />
      <KpiCard
        label={freeCashPositive ? t("kpiFreeCash") : t("kpiOverspent")}
        hint={t("kpiFreeCashHint")}
        amount={Math.abs(freeCash)}
        meta={freeCashPositive ? t("kpiFreeCashPositive") : t("kpiFreeCashNegative")}
        icon={
          freeCash === 0 ? (
            <Minus className="h-4 w-4" />
          ) : freeCashPositive ? (
            <ArrowUpRight className="h-4 w-4" />
          ) : (
            <ArrowDownRight className="h-4 w-4" />
          )
        }
        color={
          freeCash === 0
            ? "var(--muted-foreground)"
            : freeCashPositive
              ? "var(--status-on-track)"
              : "var(--status-over)"
        }
        iconBg={freeCash === 0 ? NEUTRAL_TINT : freeCashPositive ? INCOME_TINT : EXPENSE_TINT}
        loading={loading}
        locale={locale}
      />
      <KpiCard
        label={t("kpiToPockets")}
        hint={t("kpiToPocketsHint")}
        amount={putAway}
        meta={
          putAwayParts.length === 0
            ? t("kpiToPocketsNone")
            : putAwayParts
                .map(
                  (part) =>
                    `${putAwayLabels[part.key]} ${formatCurrency(part.total, "ILS", locale)}`
                )
                .join(" · ")
        }
        icon={<PiggyBank className="h-4 w-4" />}
        color={putAway > 0 ? "var(--status-plenty-left)" : "var(--muted-foreground)"}
        iconBg={putAway > 0 ? POCKET_TINT : NEUTRAL_TINT}
        loading={loading}
        locale={locale}
      />
    </div>
  );
}

interface KpiCardProps {
  label: string;
  hint?: string;
  amount: number;
  meta: string;
  icon: React.ReactNode;
  color: string;
  iconBg: string;
  loading: boolean;
  locale: Locale;
}

function KpiCard({
  label,
  hint,
  amount,
  meta,
  icon,
  color,
  iconBg,
  loading,
  locale,
}: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5" title={hint}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </div>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: iconBg, color }}
        >
          {icon}
        </div>
      </div>
      <div
        className="mt-2 font-serif text-3xl tabular-nums"
        style={{ color }}
      >
        {loading ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatCurrency(amount, "ILS", locale)
        )}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground" title={meta}>
        {meta}
      </div>
    </div>
  );
}
