"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryPicker } from "./category-picker";
import { createManualTransaction, type TransactionKind } from "@/lib/api";
import { translateCategoryName } from "@/lib/i18n-data";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Manually record a transaction the banks never see: cash, reimbursements
 * between friends, anything worth tracking that has no synced source.
 */
export function AddTransactionDialog() {
  const t = useTranslations("transactions");
  const tCat = useTranslations("categoriesSeeded");
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayLocalISO());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [category, setCategory] = useState<Category | null>(null);
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDate(todayLocalISO());
    setDescription("");
    setAmount("");
    setKind("expense");
    setCategory(null);
    setMemo("");
  };

  const kindOptions: { value: TransactionKind; label: string }[] = [
    { value: "expense", label: t("filterExpenses") },
    { value: "income", label: t("filterIncome") },
    { value: "transfer", label: t("chipTransfer") },
  ];

  const parsedAmount = Number(amount);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    description.trim().length > 0 &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const handleKindChange = (next: TransactionKind) => {
    setKind(next);
    // A transfer takes no category; expense/income categories don't mix.
    if (next === "transfer" || (category && category.kind !== next)) {
      setCategory(null);
    }
  };

  const handleSubmit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await createManualTransaction({
        date,
        amount: parsedAmount,
        kind,
        description: description.trim(),
        categoryId: category?.id ?? null,
        memo: memo.trim() || null,
      });
      for (const key of [
        "transactions",
        "summary",
        "transactions-summary",
        "home",
        "categories",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(t("addTransactionToast"));
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <Plus className="h-3.5 w-3.5" />
        {t("addTransaction")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addTransactionTitle")}</DialogTitle>
          <DialogDescription>{t("addTransactionHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 p-1 w-fit">
            {kindOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleKindChange(opt.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  kind === opt.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-date">{t("addTransactionDate")}</Label>
              <Input
                id="manual-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-amount">
                {t("addTransactionAmount")}
              </Label>
              <Input
                id="manual-amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-description">
              {t("addTransactionDescription")}
            </Label>
            <Input
              id="manual-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("addTransactionDescriptionPlaceholder")}
            />
          </div>

          {kind !== "transfer" && (
            <div className="space-y-1.5">
              <Label>{t("headerCategory")}</Label>
              <CategoryPicker
                kinds={[kind]}
                onSelect={setCategory}
                triggerClassName="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-accent/50"
              >
                {category ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate">
                      {translateCategoryName(category.name, tCat)}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {t("addTransactionPickCategory")}
                  </span>
                )}
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </CategoryPicker>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="manual-memo">{t("addTransactionMemo")}</Label>
            <Input
              id="manual-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("addTransactionMemoPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            {t("addTransactionCancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!valid || saving}>
            {saving && <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("addTransactionSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
