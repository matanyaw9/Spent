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
  /** Per-card nickname; when set it becomes the primary line. */
  nickname?: string | null;
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
  nickname,
}: TransactionSourceCellProps) {
  const tBanks = useTranslations("banks");
  const info = BANK_PROVIDERS.find((b) => b.id === provider);
  const providerName = translateProviderName(
    provider,
    info?.name ?? provider,
    tBanks
  );

  const base = getAccountDisplayLabel(providerName, accountLabel);
  // A card nickname wins the primary line; the provider moves underneath.
  // Account numbers only mean something for cards (last 4 digits); a bank
  // account number is noise.
  const primary = nickname?.trim() || base.primary;
  const providerLine = nickname?.trim()
    ? providerName
    : base.secondary;
  const last4 =
    info?.kind === "card" && accountNumber?.trim()
      ? accountNumber.trim().slice(-4)
      : null;
  const detail = [providerLine, last4]
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