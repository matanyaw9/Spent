import { NextResponse } from "next/server";
import {
  createPocket,
  isPocketType,
  listPockets,
} from "@/server/db/queries/pockets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { searchParams } = new URL(request.url);
  return NextResponse.json(
    listPockets(workspaceId, {
      includeArchived: searchParams.get("includeArchived") === "1",
    })
  );
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "name is required (max 40 chars)" }, { status: 400 });
  }
  if (!isPocketType(body.type)) {
    return NextResponse.json({ error: "invalid pocket type" }, { status: 400 });
  }
  const color = typeof body.color === "string" && HEX.test(body.color) ? body.color : "#A2AAC2";
  const emoji = typeof body.emoji === "string" ? body.emoji.trim().slice(0, 8) || null : null;
  const plannedMonthly =
    body.plannedMonthly == null
      ? null
      : Number.isFinite(Number(body.plannedMonthly)) && Number(body.plannedMonthly) >= 0
        ? Number(body.plannedMonthly)
        : null;

  try {
    const pocket = createPocket(workspaceId, { name, emoji, color, type: body.type, plannedMonthly });
    return NextResponse.json(pocket, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "A pocket with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
