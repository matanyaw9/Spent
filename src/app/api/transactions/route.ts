import { NextResponse } from "next/server";
import {
  createManualTransaction,
  queryTransactions,
  type TransactionKindFilter,
} from "@/server/db/queries/transactions";
import { getAllCategories } from "@/server/db/queries/categories";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

function parseKind(raw: string | null): TransactionKindFilter | undefined {
  if (raw === "expense" || raw === "income" || raw === "transfer" || raw === "all") {
    return raw;
  }
  return undefined;
}

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);

  // Support multi-id filter ("?categoryIds=1&categoryIds=2") for parent
  // category drilldowns (parent expands to its children client-side).
  const categoryIds = searchParams
    .getAll("categoryIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));

  const credentialIds = searchParams
    .getAll("credentialIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const result = queryTransactions(workspaceId, {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    category: searchParams.has("category")
      ? Number(searchParams.get("category"))
      : undefined,
    categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    sort: searchParams.get("sort") ?? undefined,
    order: (searchParams.get("order") as "asc" | "desc") ?? undefined,
    limit: searchParams.has("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
    offset: searchParams.has("offset")
      ? Number(searchParams.get("offset"))
      : undefined,
    kind: parseKind(searchParams.get("kind")),
    notCounted: ((): "hidden" | "only" | undefined => {
      const raw = searchParams.get("notCounted");
      if (raw === "hidden") return "hidden";
      if (raw === "only" || raw === "true") return "only";
      return undefined;
    })(),
    amountMin: searchParams.has("amountMin")
      ? Number(searchParams.get("amountMin"))
      : undefined,
    amountMax: searchParams.has("amountMax")
      ? Number(searchParams.get("amountMax"))
      : undefined,
    accountNumbers: (() => {
      const accs = searchParams.getAll("accountNumbers").filter(Boolean);
      return accs.length > 0 ? accs : undefined;
    })(),
    provider: searchParams.get("provider") ?? undefined,
    credentialIds: credentialIds.length > 0 ? credentialIds : undefined,
  });

  return NextResponse.json(result);
}

interface ManualBody {
  date?: unknown;
  amount?: unknown;
  kind?: unknown;
  description?: unknown;
  categoryId?: unknown;
  memo?: unknown;
}

/** Create a manual transaction (cash and the like). */
export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as ManualBody;

  if (
    typeof body.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date)
  ) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 }
    );
  }
  if (
    body.kind !== "expense" &&
    body.kind !== "income" &&
    body.kind !== "transfer"
  ) {
    return NextResponse.json(
      { error: "kind must be 'expense', 'income', or 'transfer'" },
      { status: 400 }
    );
  }
  if (typeof body.description !== "string" || !body.description.trim()) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 }
    );
  }

  let categoryId: number | null = null;
  if (body.categoryId != null) {
    const parsed = Number(body.categoryId);
    const category = getAllCategories(workspaceId).find(
      (c) => c.id === parsed
    );
    if (!category) {
      return NextResponse.json({ error: "unknown category" }, { status: 400 });
    }
    categoryId = parsed;
  }

  const id = createManualTransaction(workspaceId, {
    date: body.date,
    amount,
    kind: body.kind,
    description: body.description.trim(),
    categoryId,
    memo: typeof body.memo === "string" && body.memo.trim() ? body.memo.trim() : null,
  });

  return NextResponse.json({ id }, { status: 201 });
}
