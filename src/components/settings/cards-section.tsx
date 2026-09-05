"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { SectionShell } from "@/components/settings/section-shell";
import {
  listTransactionAccounts,
  updateCardSettings,
  type TransactionAccount,
} from "@/lib/api";
import { translateProviderName } from "@/lib/i18n-data";
import { BANK_PROVIDERS } from "@/lib/types";

const NONE = "__none__";

/**
 * Per-card settings for every card the syncs have seen: nickname (shown on
 * transactions instead of the provider name), card type, and the billing
 * day for credit cards.
 */
export function CardsSection() {
  const t = useTranslations("settings.cards");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ["transaction-accounts"],
    queryFn: () => listTransactionAccounts(),
  });
  const cards = (accountsQuery.data ?? []).filter(
    (account) =>
      BANK_PROVIDERS.find((b) => b.id === account.provider)?.kind === "card"
  );

  const mutation = useMutation({
    mutationFn: ({
      accountNumber,
      settings,
    }: {
      accountNumber: string;
      settings: Parameters<typeof updateCardSettings>[1];
    }) => updateCardSettings(accountNumber, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed");
    },
  });

  if (cards.length === 0) return null;

  return (
    <SectionShell title={t("title")} description={t("description")}>
      <ul className="divide-y divide-border/60">
        {cards.map((card) => (
          <CardRow
            key={`${card.provider}:${card.accountNumber}`}
            card={card}
            providerName={translateProviderName(
              card.provider,
              BANK_PROVIDERS.find((b) => b.id === card.provider)?.name ??
                card.provider,
              tBanks
            )}
            onSave={(settings) =>
              mutation.mutate({ accountNumber: card.accountNumber, settings })
            }
          />
        ))}
      </ul>
    </SectionShell>
  );
}

function CardRow({
  card,
  providerName,
  onSave,
}: {
  card: TransactionAccount;
  providerName: string;
  onSave: (settings: Parameters<typeof updateCardSettings>[1]) => void;
}) {
  const t = useTranslations("settings.cards");
  const info = BANK_PROVIDERS.find((b) => b.id === card.provider);
  const [nickname, setNickname] = useState(card.nickname ?? "");

  const commitNickname = () => {
    const trimmed = nickname.trim();
    if (trimmed === (card.nickname ?? "")) return;
    onSave({ nickname: trimmed || null });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {info ? (
          <ProviderBadge
            color={info.color}
            name={providerName}
            domain={info.domain}
            size={28}
            radius={8}
          />
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {card.nickname ?? providerName}
          </div>
          <div className="text-xs text-muted-foreground">
            {providerName} · {card.accountNumber.slice(-4)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          onBlur={commitNickname}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder={t("nicknamePlaceholder")}
          maxLength={64}
          className="h-8 w-36 text-sm"
          aria-label={t("nicknamePlaceholder")}
        />
        <Select
          value={card.cardType ?? NONE}
          onValueChange={(v) => {
            if (!v) return;
            onSave({
              cardType:
                v === NONE ? null : (v as "credit" | "debit" | "prepaid"),
            });
          }}
        >
          <SelectTrigger className="h-8 w-32 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("typeUnset")}</SelectItem>
            <SelectItem value="credit">{t("typeCredit")}</SelectItem>
            <SelectItem value="debit">{t("typeDebit")}</SelectItem>
            <SelectItem value="prepaid">{t("typePrepaid")}</SelectItem>
          </SelectContent>
        </Select>
        {card.cardType === "credit" && (
          <Select
            value={card.billingDay != null ? String(card.billingDay) : NONE}
            onValueChange={(v) => {
              if (!v) return;
              onSave({ billingDay: v === NONE ? null : Number(v) });
            }}
          >
            <SelectTrigger
              className="h-8 w-36 text-sm"
              aria-label={t("billingDay")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value={NONE}>{t("billingDayUnset")}</SelectItem>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <SelectItem key={day} value={String(day)}>
                  {t("billingDayOption", { day })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </li>
  );
}
