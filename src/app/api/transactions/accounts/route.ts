import { NextResponse } from "next/server";
import { listTransactionAccounts } from "@/server/db/queries/transactions";
import { updateCardSettings } from "@/server/db/queries/cards";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listTransactionAccounts(workspaceId));
}

/** Merge card settings: nickname, card type, billing day. */
export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as {
    accountNumber?: unknown;
    nickname?: unknown;
    cardType?: unknown;
    billingDay?: unknown;
  };
  if (typeof body.accountNumber !== "string" || !body.accountNumber.trim()) {
    return NextResponse.json(
      { error: "accountNumber is required" },
      { status: 400 }
    );
  }

  const input: {
    nickname?: string | null;
    cardType?: "credit" | "debit" | "prepaid" | null;
    billingDay?: number | null;
  } = {};

  if (body.nickname !== undefined) {
    if (body.nickname !== null && typeof body.nickname !== "string") {
      return NextResponse.json(
        { error: "nickname must be a string or null" },
        { status: 400 }
      );
    }
    input.nickname =
      typeof body.nickname === "string"
        ? body.nickname.trim().slice(0, 64) || null
        : null;
  }
  if (body.cardType !== undefined) {
    if (
      body.cardType !== null &&
      body.cardType !== "credit" &&
      body.cardType !== "debit" &&
      body.cardType !== "prepaid"
    ) {
      return NextResponse.json(
        { error: "cardType must be 'credit', 'debit', 'prepaid', or null" },
        { status: 400 }
      );
    }
    input.cardType = body.cardType;
  }
  if (body.billingDay !== undefined) {
    if (body.billingDay !== null) {
      const day = Number(body.billingDay);
      if (!Number.isInteger(day) || day < 1 || day > 28) {
        return NextResponse.json(
          { error: "billingDay must be 1-28 or null" },
          { status: 400 }
        );
      }
      input.billingDay = day;
    } else {
      input.billingDay = null;
    }
  }

  updateCardSettings(workspaceId, body.accountNumber.trim(), input);
  return NextResponse.json({ success: true });
}
