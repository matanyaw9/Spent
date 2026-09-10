"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionShell } from "@/components/settings/section-shell";
import { ColorDotPicker } from "@/components/settings/color-dot-picker";
import {
  createPocket,
  deletePocket,
  listPockets,
  updatePocket,
  type PocketInput,
} from "@/lib/api";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";
import { cn } from "@/lib/utils";
import type { Pocket, PocketType } from "@/lib/types";

const TYPE_LABELS: Record<PocketType, string> = {
  cash: "Cash",
  savings: "Savings",
  investment: "Investment",
  loan: "Loan",
  other: "Other",
};

const TYPE_HINTS: Record<PocketType, string> = {
  cash: "ATM withdrawals go in; the cash entries you add by hand are the real spending.",
  savings: "Money set aside. Standing orders to a savings account belong here.",
  investment: "Brokerage or bank deposits. Buying is not spending, selling is not income.",
  loan: "Repayments go in and shrink the debt. Extra repayment shows as a win.",
  other: "Anything else that is your own money moving around.",
};

const DEFAULT_EMOJI: Record<PocketType, string> = {
  cash: "💵",
  savings: "🏦",
  investment: "📈",
  loan: "🏠",
  other: "🪙",
};

export default function PocketsSettingsPage() {
  const queryClient = useQueryClient();
  const pocketsQuery = useQuery({
    queryKey: ["pockets", "all"],
    queryFn: () => listPockets(true),
  });
  const pockets = pocketsQuery.data ?? [];
  const active = pockets.filter((p) => !p.archivedAt);
  const archived = pockets.filter((p) => p.archivedAt);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pockets"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["transactions-summary"] });
  };

  return (
    <SectionShell
      title="Pockets"
      description="Places your own money sits: cash, savings, investments, a loan. Moving money into a pocket is neither spending nor income, so the dashboard can show what you put away instead of what you spent."
    >
      <div className="flex items-center justify-end">
        <NewPocketDialog onCreated={invalidate} />
      </div>

      {!pocketsQuery.data ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {active.map((pocket) => (
                <PocketRow key={pocket.id} pocket={pocket} onChanged={invalidate} />
              ))}
              {active.length === 0 && (
                <li className="p-8 text-center text-sm text-muted-foreground">
                  No pockets. Create one to start tracking where money goes.
                </li>
              )}
            </ul>
          </div>
          {archived.length > 0 && (
            <section>
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Archived
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-card opacity-70">
                <ul className="divide-y divide-border/60">
                  {archived.map((pocket) => (
                    <PocketRow key={pocket.id} pocket={pocket} onChanged={invalidate} />
                  ))}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </SectionShell>
  );
}

function PocketRow({ pocket, onChanged }: { pocket: Pocket; onChanged: () => void }) {
  const [name, setName] = useState(pocket.name);
  const [emoji, setEmoji] = useState(pocket.emoji ?? "");
  const [planned, setPlanned] = useState(
    pocket.plannedMonthly != null ? String(pocket.plannedMonthly) : ""
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mutation = useMutation({
    mutationFn: (patch: Parameters<typeof updatePocket>[1]) => updatePocket(pocket.id, patch),
    onSuccess: onChanged,
    onError: (err: Error) => toast.error(err.message || "Couldn't update the pocket"),
  });
  const removeMutation = useMutation({
    mutationFn: () => deletePocket(pocket.id),
    onSuccess: () => {
      toast.success(`Deleted "${pocket.name}"`);
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't delete the pocket"),
  });

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(pocket.name);
      return;
    }
    if (trimmed !== pocket.name) mutation.mutate({ name: trimmed });
  };
  const commitEmoji = () => {
    const trimmed = emoji.trim();
    if (trimmed !== (pocket.emoji ?? "")) mutation.mutate({ emoji: trimmed || null });
  };
  const commitPlanned = () => {
    const trimmed = planned.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      setPlanned(pocket.plannedMonthly != null ? String(pocket.plannedMonthly) : "");
      return;
    }
    if (next !== pocket.plannedMonthly) mutation.mutate({ plannedMonthly: next });
  };

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          onBlur={commitEmoji}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Emoji"
          maxLength={4}
          className="h-9 w-12 text-center text-lg"
        />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Name"
          maxLength={40}
          className="h-9 w-40 font-medium"
        />
        <Select
          value={pocket.type}
          items={TYPE_LABELS}
          onValueChange={(v) => v && mutation.mutate({ type: v as PocketType })}
        >
          <SelectTrigger className="h-9 w-32" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_LABELS) as PocketType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {pocket.type === "loan" ? "Repay monthly" : "Plan monthly"}
          <span className="text-muted-foreground/70">₪</span>
          <Input
            type="number"
            min={0}
            inputMode="decimal"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            onBlur={commitPlanned}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="optional"
            aria-label="Planned monthly amount"
            className="h-9 w-24 text-sm"
          />
        </label>
        <div className="ms-auto flex items-center gap-1">
          <span className="me-1 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {pocket.transactionCount} {pocket.transactionCount === 1 ? "movement" : "movements"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            onClick={() => mutation.mutate({ archived: !pocket.archivedAt })}
            title={pocket.archivedAt ? "Restore" : "Archive (keeps history)"}
          >
            {pocket.archivedAt ? (
              <ArchiveRestore className="h-3.5 w-3.5" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
            {pocket.archivedAt ? "Restore" : "Archive"}
          </Button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
              >
                Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete pocket"
              title={
                pocket.transactionCount > 0
                  ? "Delete. Its movements stay as plain transfers."
                  : "Delete"
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="max-w-xl text-xs text-muted-foreground">{TYPE_HINTS[pocket.type]}</p>
        <ColorDotPicker
          value={pocket.color}
          onChange={(color) => mutation.mutate({ color })}
          disabled={mutation.isPending}
        />
      </div>
    </li>
  );
}

function NewPocketDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PocketType>("savings");
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI.savings);
  const [color, setColor] = useState<string>(CATEGORY_COLOR_PALETTE[0]);
  const [planned, setPlanned] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const input: PocketInput = {
        name: name.trim(),
        type,
        emoji: emoji.trim() || null,
        color,
        plannedMonthly: planned.trim() === "" ? null : Number(planned),
      };
      return createPocket(input);
    },
    onSuccess: () => {
      toast.success(`Created "${name.trim()}"`);
      setName("");
      setPlanned("");
      setOpen(false);
      onCreated();
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't create the pocket"),
  });

  const valid =
    name.trim().length > 0 &&
    (planned.trim() === "" || (Number.isFinite(Number(planned)) && Number(planned) >= 0));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New pocket
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New pocket</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-16 space-y-1.5">
              <Label htmlFor="new-pocket-emoji">Emoji</Label>
              <Input
                id="new-pocket-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="text-center text-lg"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-pocket-name">Name</Label>
              <Input
                id="new-pocket-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Interactive Israel, Mortgage"
                autoFocus
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && valid) mutation.mutate();
                }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(TYPE_LABELS) as PocketType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setType(option);
                    if (!emoji || Object.values(DEFAULT_EMOJI).includes(emoji)) {
                      setEmoji(DEFAULT_EMOJI[option]);
                    }
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                    type === option
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {TYPE_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{TYPE_HINTS[type]}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pocket-planned">
              {type === "loan" ? "Monthly repayment (optional)" : "Planned monthly amount (optional)"}
            </Label>
            <Input
              id="new-pocket-planned"
              type="number"
              min={0}
              inputMode="decimal"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorDotPicker value={color} onChange={setColor} size="md" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
