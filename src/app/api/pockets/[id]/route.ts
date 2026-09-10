import { NextResponse } from "next/server";
import {
  deletePocket,
  isPocketType,
  updatePocket,
} from "@/server/db/queries/pockets";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Parameters<typeof updatePocket>[2] = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 40) {
      return NextResponse.json({ error: "name must be 1-40 chars" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.emoji !== undefined) {
    patch.emoji = typeof body.emoji === "string" ? body.emoji.trim().slice(0, 8) || null : null;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !HEX.test(body.color)) {
      return NextResponse.json({ error: "color must be #rrggbb" }, { status: 400 });
    }
    patch.color = body.color;
  }
  if (body.type !== undefined) {
    if (!isPocketType(body.type)) {
      return NextResponse.json({ error: "invalid pocket type" }, { status: 400 });
    }
    patch.type = body.type;
  }
  if (body.plannedMonthly !== undefined) {
    if (body.plannedMonthly === null) {
      patch.plannedMonthly = null;
    } else {
      const n = Number(body.plannedMonthly);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: "plannedMonthly must be >= 0" }, { status: 400 });
      }
      patch.plannedMonthly = n;
    }
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
    }
    patch.archived = body.archived;
  }

  try {
    const pocket = updatePocket(workspaceId, numericId, patch);
    if (!pocket) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(pocket);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "A pocket with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
  const ok = deletePocket(workspaceId, numericId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
