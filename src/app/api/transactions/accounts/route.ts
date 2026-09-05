import { NextResponse } from "next/server";
import { listTransactionAccounts } from "@/server/db/queries/transactions";
import { setCardNickname } from "@/server/db/queries/card-nicknames";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listTransactionAccounts(workspaceId));
}

/** Set or clear (empty/null) a card's nickname. */
export async function PUT(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as {
    accountNumber?: unknown;
    nickname?: unknown;
  };
  if (typeof body.accountNumber !== "string" || !body.accountNumber.trim()) {
    return NextResponse.json(
      { error: "accountNumber is required" },
      { status: 400 }
    );
  }
  if (body.nickname !== null && typeof body.nickname !== "string") {
    return NextResponse.json(
      { error: "nickname must be a string or null" },
      { status: 400 }
    );
  }
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim().slice(0, 64) : null;
  setCardNickname(workspaceId, body.accountNumber.trim(), nickname || null);
  return NextResponse.json({ success: true });
}
