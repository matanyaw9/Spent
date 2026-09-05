import { NextResponse } from "next/server";
import {
  bulkAssignCategory,
  bulkSetTransactionExcluded,
  bulkSetTransactionKind,
  resolveFilteredTransactionIds,
  type TransactionKindFilter,
  type TransactionListFilter,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

/**
 * Bulk actions over many transactions at once. The target set is either an
 * explicit id list (rows the user ticked) or a list filter (the user chose
 * "select all N matching" across pages, so the ids are resolved here from
 * the same filter the list query uses).
 */

const MAX_IDS = 10000;

interface BulkBody {
  ids?: unknown;
  filter?: unknown;
  action?: {
    type?: unknown;
    categoryId?: unknown;
    kind?: unknown;
    excluded?: unknown;
  };
}

function parseIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.map(Number);
  if (ids.length === 0 || ids.length > MAX_IDS) return null;
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) return null;
  return ids;
}

function parseNumberArray(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const nums = raw.map(Number).filter((n) => Number.isFinite(n));
  return nums.length > 0 ? nums : undefined;
}

function parseFilter(raw: unknown): TransactionListFilter | null {
  if (raw == null || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const kind = f.kind;
  return {
    from: typeof f.from === "string" ? f.from : undefined,
    to: typeof f.to === "string" ? f.to : undefined,
    search: typeof f.search === "string" && f.search ? f.search : undefined,
    categoryIds: parseNumberArray(f.categoryIds),
    credentialIds: parseNumberArray(f.credentialIds),
    kind:
      kind === "expense" || kind === "income" || kind === "transfer" || kind === "all"
        ? (kind as TransactionKindFilter)
        : undefined,
    notCounted: f.notCounted === true ? true : undefined,
    excluded:
      f.excluded === "hide" || f.excluded === "only" ? f.excluded : undefined,
    amountMin:
      typeof f.amountMin === "number" && Number.isFinite(f.amountMin)
        ? f.amountMin
        : undefined,
    amountMax:
      typeof f.amountMax === "number" && Number.isFinite(f.amountMax)
        ? f.amountMax
        : undefined,
    accountNumbers: Array.isArray(f.accountNumbers)
      ? f.accountNumbers.filter((a): a is string => typeof a === "string")
      : undefined,
  };
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as BulkBody;

  let ids: number[];
  if (body.ids !== undefined) {
    const parsed = parseIds(body.ids);
    if (!parsed) {
      return NextResponse.json(
        { error: `ids must be 1-${MAX_IDS} positive integers` },
        { status: 400 }
      );
    }
    ids = parsed;
  } else if (body.filter !== undefined) {
    const filter = parseFilter(body.filter);
    if (!filter) {
      return NextResponse.json({ error: "invalid filter" }, { status: 400 });
    }
    ids = resolveFilteredTransactionIds(workspaceId, filter);
    if (ids.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0 });
    }
  } else {
    return NextResponse.json(
      { error: "either ids or filter is required" },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action == null || typeof action !== "object") {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  if (action.type === "kind") {
    if (
      action.kind !== "expense" &&
      action.kind !== "income" &&
      action.kind !== "transfer"
    ) {
      return NextResponse.json(
        { error: "action.kind must be 'expense', 'income', or 'transfer'" },
        { status: 400 }
      );
    }
    const updated = bulkSetTransactionKind(workspaceId, ids, action.kind);
    return NextResponse.json({ updated, skipped: ids.length - updated });
  }

  if (action.type === "exclude") {
    if (typeof action.excluded !== "boolean") {
      return NextResponse.json(
        { error: "action.excluded must be a boolean" },
        { status: 400 }
      );
    }
    const updated = bulkSetTransactionExcluded(
      workspaceId,
      ids,
      action.excluded
    );
    return NextResponse.json({ updated, skipped: ids.length - updated });
  }

  if (action.type === "category") {
    const categoryId = Number(action.categoryId);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json(
        { error: "action.categoryId is required" },
        { status: 400 }
      );
    }
    const category = getAllCategories(workspaceId).find(
      (c) => c.id === categoryId
    );
    if (!category || (category.kind !== "expense" && category.kind !== "income")) {
      return NextResponse.json(
        { error: "unknown category" },
        { status: 400 }
      );
    }

    const result = bulkAssignCategory(
      workspaceId,
      ids,
      categoryId,
      category.kind
    );

    // The user just told us these merchants belong to this category; remember
    // it so future syncs categorize them without asking the AI. Bulk edits
    // never cascade to unselected rows, so this only affects new imports.
    for (const merchant of result.merchants) {
      recordMerchantCategory(
        workspaceId,
        merchant,
        categoryId,
        category.kind,
        "user"
      );
    }

    return NextResponse.json({
      updated: result.updated,
      skipped: result.skipped,
    });
  }

  return NextResponse.json(
    { error: "action.type must be 'category', 'kind', or 'exclude'" },
    { status: 400 }
  );
}
