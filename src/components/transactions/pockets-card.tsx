"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { PocketSummary } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

interface PocketsCardProps {
  pockets: PocketSummary[];
  loading: boolean;
}

/**
 * Where the money went this period, pocket by pocket, against the planned
 * amount. Framing is deliberately "put away", not "cost": extra into a
 * loan or investment is good news and reads green.
 */
export function PocketsCard({ pockets, loading }: PocketsCardProps) {
  const t = useTranslations("transactions");
  const locale = useLocale() as Locale;
  const active = pockets.filter(
    (pocket) => pocket.moneyIn > 0 || pocket.moneyOut > 0 || pocket.plannedMonthly
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          {t("pocketsTitle")}
        </div>
        <Link
          href="/settings/pockets"
          className="text-muted-foreground transition-colors hover:text-foreground"
          title={t("pocketManage")}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-3 space-y-2.5">
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("loadingShort")}</div>
        ) : active.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("pocketsEmpty")}</div>
        ) : (
          active.map((pocket) => <PocketRow key={pocket.pocketId} pocket={pocket} locale={locale} />)
        )}
      </div>
    </div>
  );
}

function PocketRow({ pocket, locale }: { pocket: PocketSummary; locale: Locale }) {
  const t = useTranslations("transactions");
  const net = pocket.moneyIn - pocket.moneyOut;
  const planned = pocket.plannedMonthly ?? 0;
  const diff = planned > 0 ? net - planned : null;
  // For a loan, "in" means repaid; extra repayment beats plan. For the
  // others, more put away than planned is also good. Same sign either way.
  const diffGood = diff != null && diff >= 0;
  const progress = planned > 0 ? Math.max(0, Math.min(1, net / planned)) : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-5 text-center text-base leading-none">{pocket.emoji ?? "•"}</span>
          <span className="truncate text-sm font-medium">{pocket.name}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          {pocket.moneyOut > 0 && pocket.type !== "loan" && (
            <span className="text-[11px] text-muted-foreground">
              {t("pocketsOut", { amount: formatCurrency(pocket.moneyOut, "ILS", locale) })}
            </span>
          )}
          <span
            className="font-serif text-base tabular-nums"
            style={{ color: net > 0 ? pocket.color : "var(--muted-foreground)" }}
          >
            {net === 0 && pocket.moneyIn === 0
              ? t("pocketsNoMovement")
              : `${net >= 0 ? "+" : "−"}${formatCurrency(net, "ILS", locale)}`}
          </span>
        </div>
      </div>
      {planned > 0 && (
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(progress ?? 0) * 100}%`, backgroundColor: pocket.color }}
            />
          </div>
          <span
            className="shrink-0 text-[11px] tabular-nums"
            style={{
              color:
                diff == null
                  ? "var(--muted-foreground)"
                  : diffGood
                    ? "var(--status-on-track)"
                    : "var(--status-heads-up)",
            }}
          >
            {diff == null
              ? t("pocketsPlanned", { amount: formatCurrency(planned, "ILS", locale) })
              : diffGood
                ? t("pocketsExtra", { amount: formatCurrency(diff, "ILS", locale) })
                : t("pocketsShort", { amount: formatCurrency(-diff, "ILS", locale) })}
          </span>
        </div>
      )}
    </div>
  );
}
