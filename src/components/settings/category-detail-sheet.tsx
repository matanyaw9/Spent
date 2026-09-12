"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Palette, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input, InputGroup } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteCategory,
  getCategories,
  getSettings,
  setCategoryParent,
  updateCategoryIcon,
  updateBudget,
  updateCategoryBudgetMode,
  updateCategoryColor,
  updateCategoryDescription,
  updateSettings,
} from "@/lib/api";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";
import { categoryEmoji } from "@/lib/category-emoji";
import { getCategoryDescendantIds } from "@/lib/transaction-filters";
import { cn } from "@/lib/utils";
import type { Category, CategoryWithData } from "@/lib/types";

const NONE_VALUE = "__none__";
const DESCRIPTION_MAX = 500;

export interface CategoryDetailSheetProps {
  categoryId: number | null;
  data: CategoryWithData | null;
  onClose: () => void;
}

export function CategoryDetailSheet({
  categoryId,
  data,
  onClose,
}: CategoryDetailSheetProps) {
  const open = categoryId !== null;
  const { data: allCategories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => getCategories(),
    enabled: open,
  });
  const category = useMemo(
    () => allCategories?.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId]
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md! md:max-w-lg!"
      >
        {category ? (
          <Body
            category={category}
            data={data}
            allCategories={allCategories ?? []}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  category,
  data,
  allCategories,
  onClose,
}: {
  category: Category;
  data: CategoryWithData | null;
  allCategories: Category[];
  onClose: () => void;
}) {
  const sameKind = allCategories.filter(
    (c) => c.kind === category.kind && c.id !== category.id
  );
  // Any category can be a parent, at any depth; only this category's own
  // subtree is off-limits (that would make a cycle).
  const descendantIds = new Set(
    getCategoryDescendantIds(category.id, allCategories)
  );
  const eligibleParents = sameKind
    .filter((c) => !descendantIds.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const childCategories = useMemo(
    () =>
      allCategories
        .filter((c) => c.parentId === category.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allCategories, category.id]
  );
  const isParentGroup = childCategories.length > 0 || data?.isParent === true;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SheetHeader
        className="gap-3 border-b border-border/40 p-6"
        style={{
          background: tint(category.color, 0.15),
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: category.color }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle>{category.name}</SheetTitle>
            <SheetDescription className="mt-0.5">
              {category.kind === "expense" ? "Expense" : "Income"} category
              {data?.parentName ? ` · in ${data.parentName}` : ""}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        {!category.parentId && data?.isParent !== true ? (
          <BudgetSection category={category} data={data} />
        ) : (
          <BudgetSection category={category} data={data} />
        )}

        <GroupSection
          category={category}
          eligibleParents={eligibleParents}
        />

        <IconSection category={category} />

        <ColorSection category={category} />

        <DescriptionSection category={category} />

        <DeleteCategorySection
          category={category}
          transactionCount={data?.transactionCount ?? 0}
          isParentGroup={isParentGroup}
          childCategories={childCategories}
          onDeleted={onClose}
        />
      </div>
    </div>
  );
}

function parseDeleteCategoryError(message: string): string[] | null {
  try {
    const body = JSON.parse(message) as {
      error?: string;
      children?: { name: string }[];
    };
    if (body.error === "has-children" && body.children?.length) {
      return body.children.map((c) => c.name);
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function DeleteCategorySection({
  category,
  transactionCount,
  isParentGroup,
  childCategories,
  onDeleted,
}: {
  category: Category;
  transactionCount: number;
  isParentGroup: boolean;
  childCategories: Category[];
  onDeleted: () => void;
}) {
  const t = useTranslations("settings.categories");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(
        t("deletedToast", { count: result.unassignedTransactionCount })
      );
      setOpen(false);
      onDeleted();
    },
    onError: (err: Error) => {
      const names =
        parseDeleteCategoryError(err.message) ??
        (childCategories.length > 0
          ? childCategories.map((c) => c.name)
          : null);
      if (names && names.length > 0) {
        toast.error(t("deleteHasChildrenNamed", { names: names.join(", ") }));
      } else if (
        err.message.includes("has-children") ||
        err.message.includes("409")
      ) {
        toast.error(t("deleteHasChildren"));
      } else {
        toast.error(t("deleteFailed"));
      }
    },
  });

  return (
    <>
      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{t("deleteTitle")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isParentGroup ? t("deleteParentHint") : t("deleteHint")}
            </p>
            {isParentGroup && childCategories.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 ps-4 text-xs text-foreground/80">
                {childCategories.map((child) => (
                  <li key={child.id}>{child.name}</li>
                ))}
              </ul>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => setOpen(true)}
              disabled={isParentGroup}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("deleteButton")}
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("confirmDeleteTitle", { name: category.name })}
            </DialogTitle>
            <DialogDescription>
              {t("confirmDeleteDescription", { count: transactionCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? tCommon("deleting") : t("deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BudgetSection({
  category,
  data,
}: {
  category: Category;
  data: CategoryWithData | null;
}) {
  const queryClient = useQueryClient();
  const isBudgeted = category.budgetMode === "budgeted";

  const modeMutation = useMutation({
    mutationFn: (next: "budgeted" | "tracking") =>
      updateCategoryBudgetMode(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const budgetMutation = useMutation({
    mutationFn: (amount: number | null) => updateBudget(category.id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const [amount, setAmount] = useState(
    data ? String(Math.round(data.budget)) : ""
  );

  // Reset the field when the saved budget value changes (guarded update
  // during render). Keyed on the value, not the query object, so a refetch
  // returning the same budget doesn't clobber what the user is typing.
  const budgetValue = data ? String(Math.round(data.budget)) : null;
  const [prevBudgetValue, setPrevBudgetValue] = useState(budgetValue);
  if (budgetValue !== prevBudgetValue) {
    setPrevBudgetValue(budgetValue);
    if (budgetValue != null) setAmount(budgetValue);
  }

  const handleBlur = () => {
    if (!data) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    if (Math.round(parsed) === Math.round(data.budget)) return;
    budgetMutation.mutate(parsed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Budget
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Label
              htmlFor={`mode-${category.id}`}
              className="text-sm font-medium"
            >
              {isBudgeted ? "Budgeted" : "Tracking only"}
            </Label>
            <p className="text-xs text-muted-foreground">
              {isBudgeted
                ? "Show progress vs a monthly target."
                : "Show spending without a target."}
            </p>
          </div>
          <Switch
            id={`mode-${category.id}`}
            checked={isBudgeted}
            onCheckedChange={(next) =>
              modeMutation.mutate(next ? "budgeted" : "tracking")
            }
          />
        </div>

        {isBudgeted ? (
          <div className="mt-4 space-y-1.5">
            <Label htmlFor={`budget-${category.id}`}>Monthly budget</Label>
            <InputGroup prefix="₪">
              <Input
                id={`budget-${category.id}`}
                type="number"
                className="text-end tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onBlur={handleBlur}
                min={0}
              />
            </InputGroup>
            {data ? (
              <p className="text-[11px] text-muted-foreground">
                Spent ₪{Math.round(data.spent).toLocaleString("en-IL")} this
                month
                {data.vsTypical && data.vsTypical.typical > 0 ? (
                  <>
                    {" "}
                    · typical ≈ ₪
                    {Math.round(data.vsTypical.typical).toLocaleString(
                      "en-IL"
                    )}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function GroupSection({
  category,
  eligibleParents,
}: {
  category: Category;
  eligibleParents: Category[];
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (parentId: number | null) =>
      setCategoryParent(category.id, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Group updated");
    },
    onError: (err: Error) => {
      const reason = err.message;
      if (reason === "kind-mismatch") {
        toast.error("Parent must be the same kind (expense or income).");
      } else if (reason === "cycle") {
        toast.error("That would make a category its own ancestor.");
      } else {
        toast.error("Couldn't update parent.");
      }
    },
  });
  const current =
    category.parentId == null ? NONE_VALUE : String(category.parentId);

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Group
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label>Parent group</Label>
        <Select
          value={current}
          onValueChange={(v) => {
            if (!v) return;
            const next = v === NONE_VALUE ? null : Number(v);
            mutation.mutate(next);
          }}
        >
          <SelectTrigger>
            <SelectValue>
              {(value: string) =>
                value === NONE_VALUE
                  ? "(no parent)"
                  : eligibleParents.find((p) => String(p.id) === value)?.name ??
                    "(no parent)"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>(no parent)</SelectItem>
            {eligibleParents.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Use a parent group to roll spending up. Most users keep the defaults.
        </p>
      </div>
    </section>
  );
}

function IconSection({ category }: { category: Category }) {
  const queryClient = useQueryClient();
  const savedEmoji = categoryEmoji(category.icon) ?? "";
  const [value, setValue] = useState(savedEmoji);
  // Reset when the saved icon changes (guarded update during render).
  const [prevIcon, setPrevIcon] = useState(category.icon);
  if (prevIcon !== category.icon) {
    setPrevIcon(category.icon);
    setValue(categoryEmoji(category.icon) ?? "");
  }

  const mutation = useMutation({
    mutationFn: (icon: string | null) => updateCategoryIcon(category.id, icon),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Couldn't update the icon");
    },
  });

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed === savedEmoji) return;
    mutation.mutate(trimmed || null);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Icon
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="🙂"
            maxLength={12}
            className="h-9 w-20 text-center text-lg"
            aria-label="Category emoji"
          />
          {savedEmoji && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setValue("");
                mutation.mutate(null);
              }}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Optional emoji shown next to the name everywhere. Open your
          system&apos;s emoji picker with Win+. or Ctrl+Cmd+Space.
        </p>
      </div>
    </section>
  );
}

function ColorSection({ category }: { category: Category }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });
  const palette = settingsQuery.data?.categoryPalette ?? [
    ...CATEGORY_COLOR_PALETTE,
  ];
  const [pendingNew, setPendingNew] = useState<string | null>(null);
  const [editState, setEditState] = useState<{
    index: number;
    value: string;
  } | null>(null);

  const applyMutation = useMutation({
    mutationFn: (color: string) => updateCategoryColor(category.id, color),
    onSuccess: () => {
      // No toast: the swatch ring and every badge recolor immediately.
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Couldn't update the color");
    },
  });

  const paletteMutation = useMutation({
    mutationFn: (colors: string[]) =>
      updateSettings({ categoryPalette: colors }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Couldn't save the palette");
    },
  });

  // New colors and edits commit when the native picker closes (blur), not
  // on every drag tick inside the color dialog.
  const commitNewColor = () => {
    if (!pendingNew) return;
    const color = pendingNew;
    setPendingNew(null);
    applyMutation.mutate(color);
    if (!palette.some((c) => c.toLowerCase() === color.toLowerCase())) {
      paletteMutation.mutate([...palette, color]);
    }
  };

  const commitEdit = () => {
    if (!editState) return;
    const { index, value } = editState;
    setEditState(null);
    const previous = palette[index];
    if (!previous || previous.toLowerCase() === value.toLowerCase()) return;
    const next = [...palette];
    next[index] = value;
    paletteMutation.mutate(next);
    // Editing a swatch recolors this category too when it was using it.
    if (category.color.toLowerCase() === previous.toLowerCase()) {
      applyMutation.mutate(value);
    }
  };

  const removeColor = (index: number) => {
    paletteMutation.mutate(palette.filter((_, i) => i !== index));
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Color
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {palette.map((color, index) => (
            <span key={`${color}-${index}`} className="group relative inline-flex">
              <button
                type="button"
                disabled={applyMutation.isPending}
                onClick={() => applyMutation.mutate(color)}
                aria-label={`Use ${color}`}
                className={cn(
                  "h-7 w-7 rounded-full border transition-transform hover:scale-110",
                  category.color.toLowerCase() === color.toLowerCase()
                    ? "border-foreground ring-2 ring-foreground/30"
                    : "border-border"
                )}
                style={{
                  backgroundColor:
                    editState?.index === index ? editState.value : color,
                }}
              />
              <button
                type="button"
                onClick={() => removeColor(index)}
                aria-label={`Remove ${color} from palette`}
                title="Remove from palette"
                className="absolute -end-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive group-hover:flex"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
              <label
                aria-label={`Edit ${color}`}
                title="Edit this color"
                className="absolute -bottom-1.5 -end-1.5 hidden h-4 w-4 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground group-hover:flex"
              >
                <Palette className="h-2.5 w-2.5" />
                <input
                  type="color"
                  value={editState?.index === index ? editState.value : color}
                  onChange={(e) =>
                    setEditState({ index, value: e.target.value })
                  }
                  onBlur={commitEdit}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </span>
          ))}
          <label
            title="Add a color to the palette"
            className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:text-foreground"
            style={pendingNew ? { backgroundColor: pendingNew } : undefined}
          >
            <Palette className="h-3.5 w-3.5" />
            <input
              type="color"
              value={pendingNew ?? category.color}
              onChange={(e) => setPendingNew(e.target.value)}
              onBlur={commitNewColor}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Click a swatch to use it. Hover one to edit or remove it from the
          palette; the dashed circle adds a new color.
        </p>
      </div>
    </section>
  );
}

function DescriptionSection({ category }: { category: Category }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(category.description ?? "");
  // Reset when the category's saved description changes (guarded update
  // during render instead of an effect).
  const [prevDescription, setPrevDescription] = useState(category.description);
  if (prevDescription !== category.description) {
    setPrevDescription(category.description);
    setValue(category.description ?? "");
  }

  const mutation = useMutation({
    mutationFn: (next: string | null) =>
      updateCategoryDescription(category.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Description saved");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Couldn't save description");
    },
  });

  const handleBlur = () => {
    const trimmed = value.trim();
    const current = (category.description ?? "").trim();
    if (trimmed === current) return;
    if (trimmed.length > DESCRIPTION_MAX) {
      toast.error(
        `Description must be ${DESCRIPTION_MAX} characters or fewer.`
      );
      return;
    }
    mutation.mutate(trimmed.length === 0 ? null : trimmed);
  };

  return (
    <section>
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        AI hint
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card p-4 space-y-2">
        <Label htmlFor={`desc-${category.id}`}>Description</Label>
        <textarea
          id={`desc-${category.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder={`Describe what belongs in "${category.name}" — and what does NOT.`}
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sent to the AI on every categorize.</span>
          <span className="tabular-nums">
            {value.length} / {DESCRIPTION_MAX}
          </span>
        </div>
      </div>
    </section>
  );
}

function tint(color: string, alpha: number): string {
  return `color-mix(in oklch, ${color} ${Math.round(alpha * 100)}%, var(--card))`;
}
