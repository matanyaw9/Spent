"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionShell } from "@/components/settings/section-shell";
import { ColorDotPicker } from "@/components/settings/color-dot-picker";
import { createTag, deleteTag, listTags, updateTag } from "@/lib/api";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";
import type { Tag } from "@/lib/types";

export default function TagsSettingsPage() {
  const queryClient = useQueryClient();
  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: () => listTags() });
  const tags = tagsQuery.data ?? [];
  const [newName, setNewName] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tags"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createTag({
        name: newName.trim(),
        color: CATEGORY_COLOR_PALETTE[tags.length % CATEGORY_COLOR_PALETTE.length],
      }),
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't create the tag"),
  });

  return (
    <SectionShell
      title="Tags"
      description="Labels that cut across categories: a trip, a project, something to be reimbursed. A transaction can carry any number of tags, and tags never change totals."
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newName.trim()) createMutation.mutate();
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag, e.g. Berlin 2026"
          maxLength={40}
          className="max-w-xs"
        />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!newName.trim() || createMutation.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </form>

      {!tagsQuery.data ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : tags.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No tags yet. You can also create one straight from a transaction row.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border/60">
            {tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} onChanged={invalidate} />
            ))}
          </ul>
        </div>
      )}
    </SectionShell>
  );
}

function TagRow({ tag, onChanged }: { tag: Tag; onChanged: () => void }) {
  const [name, setName] = useState(tag.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mutation = useMutation({
    mutationFn: (patch: { name?: string; color?: string }) => updateTag(tag.id, patch),
    onSuccess: onChanged,
    onError: (err: Error) => toast.error(err.message || "Couldn't update the tag"),
  });
  const removeMutation = useMutation({
    mutationFn: () => deleteTag(tag.id),
    onSuccess: () => {
      toast.success(`Deleted "${tag.name}"`);
      onChanged();
    },
    onError: (err: Error) => toast.error(err.message || "Couldn't delete the tag"),
  });

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(tag.name);
      return;
    }
    if (trimmed !== tag.name) mutation.mutate({ name: trimmed });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label="Name"
        maxLength={40}
        className="h-9 w-48 font-medium"
      />
      <ColorDotPicker
        value={tag.color}
        onChange={(color) => mutation.mutate({ color })}
        disabled={mutation.isPending}
      />
      <div className="ms-auto flex items-center gap-2">
        <span className="text-xs tabular-nums text-muted-foreground">
          {tag.transactionCount} {tag.transactionCount === 1 ? "transaction" : "transactions"}
        </span>
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
            aria-label="Delete tag"
            title="Delete. Rows keep everything else."
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}
