import { NextResponse } from "next/server";
import {
  updateTransactionCategory,
  clearTransactionCategory,
  setTransactionKind,
  setTransactionNeedsReview,
  setTransactionNote,
  getTransactionContext,
  deleteManualTransaction,
} from "@/server/db/queries/transactions";
import { recordMerchantCategory } from "@/server/lib/merchant-memory";
import { recordCorrection } from "@/server/db/queries/category-corrections";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json()) as { categoryId: number | null };
  const numericId = Number(id);

  // null clears the category: "Uncategorized" is a valid choice.
  if (body.categoryId === null) {
    clearTransactionCategory(workspaceId, numericId);
    return NextResponse.json({ success: true });
  }
  if (!body.categoryId) {
    return NextResponse.json(
      { error: "categoryId is required" },
      { status: 400 }
    );
  }

  const before = getTransactionContext(workspaceId, numericId);
  updateTransactionCategory(workspaceId, numericId, body.categoryId, "user");
  setTransactionNeedsReview(workspaceId, numericId, false);

  if (before && (before.kind === "expense" || before.kind === "income")) {
    const category = getAllCategories(workspaceId).find(
      (c) => c.id === body.categoryId
    );
    if (category && (category.kind === "expense" || category.kind === "income")) {
      // Remember the choice for FUTURE syncs only. Recategorizing one
      // transaction must never silently rewrite the merchant's existing
      // rows; a rule is the explicit way to do that at scale.
      recordMerchantCategory(
        workspaceId,
        before.description,
        body.categoryId,
        category.kind,
        "user"
      );

      // If the user just overrode an AI-set category, log it as a correction
      // so the categorizer learns not to repeat the mistake on similar merchants.
      if (
        before.categorySource === "ai" &&
        before.categoryId != null &&
        before.categoryId !== body.categoryId
      ) {
        recordCorrection(
          workspaceId,
          before.description,
          before.categoryId,
          body.categoryId,
          category.kind
        );
      }
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // Only manually entered rows can be deleted; bank-synced rows would just
  // come back on the next sync, so those are excluded instead.
  const ok = deleteManualTransaction(workspaceId, numericId);
  if (!ok) {
    return NextResponse.json(
      { error: "only manual transactions can be deleted" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    approve?: unknown;
    note?: unknown;
  };

  const numericId = Number(id);

  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") {
      return NextResponse.json(
        { error: "note must be a string or null" },
        { status: 400 }
      );
    }
    const value =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : null;
    const ok = setTransactionNote(workspaceId, numericId, value);
    if (!ok) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  if (body.approve === true) {
    const ctx = getTransactionContext(workspaceId, numericId);
    if (!ctx) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    setTransactionNeedsReview(workspaceId, numericId, false);
    if (
      ctx.categoryId != null &&
      (ctx.kind === "expense" || ctx.kind === "income")
    ) {
      const category = getAllCategories(workspaceId).find(
        (c) => c.id === ctx.categoryId
      );
      if (
        category &&
        (category.kind === "expense" || category.kind === "income")
      ) {
        recordMerchantCategory(
          workspaceId,
          ctx.description,
          ctx.categoryId,
          category.kind,
          "approved-ai"
        );
      }
    }
    return NextResponse.json({ success: true });
  }

  if (
    body.kind !== "expense" &&
    body.kind !== "income" &&
    body.kind !== "transfer"
  ) {
    return NextResponse.json(
      { error: "kind must be 'expense', 'income', or 'transfer', or set approve:true" },
      { status: 400 }
    );
  }

  setTransactionKind(workspaceId, numericId, body.kind);

  return NextResponse.json({ success: true });
}
