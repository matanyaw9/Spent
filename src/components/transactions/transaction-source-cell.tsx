"use client";

import { useTranslations } from "next-intl";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS } from "@/lib/types";

interface TransactionSourceCellProps {
  provider: string;
  accountLabel: string | null;
  /** transactions.account_number: the card or bank account the row hit. */
  accountNumber?: string | null;
}

export function getAccountDisplayLabel(
  providerName: string,
  accountLabel: string | null
): { primary: string; secondary: string | null } {
  const labelDistinct =
    accountLabel != null &&
    accountLabel.trim() !== "" &&
    accountLabel.trim().toLowerCase() !== providerName.trim().toLowerCase();
  return {
    primary: labelDistinct ? accountLabel.trim() : providerName,
    secondary: labelDistinct ? providerName : null,
  };
}

export function TransactionSourceCell({
  provider,
  accountLabel,
  accountNumber,
}: TransactionSourceCellProps) {
  const tBanks = useTranslations("banks");
  const info = BANK_PROVIDERS.find((b) => b.id === provider);
  const providerName = translateProviderName(
    provider,
    info?.name ?? provider,
    tBanks
  );

  const { primary, secondary } = getAccountDisplayLabel(providerName, accountLabel);
  const detail = [secondary, accountNumber?.trim() || null]
    .filter((part): part is string => part != null)
    .join(" · ");
  const tooltip = detail ? `${primary} · ${detail}` : primary;

  return (
    <div className="flex min-w-0 items-center gap-2" title={tooltip}>
      {info ? (
        <ProviderBadge
          color={info.color}
          name={providerName}
          domain={info.domain}
          size={20}
          radius={6}
        />
      ) : (
        <div className="h-5 w-5 shrink-0 rounded-md bg-muted" aria-hidden />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm leading-tight">{primary}</div>
        {detail ? (
          <div className="truncate text-xs text-muted-foreground">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}