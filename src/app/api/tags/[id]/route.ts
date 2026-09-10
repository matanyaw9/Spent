import { NextResponse } from "next/server";
import { deleteTag, updateTag } from "@/server/db/queries/tags";
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
  const patch: { name?: string; color?: string } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 40) {
      return NextResponse.json({ error: "name must be 1-40 chars" }, { status: 400 });
    }
    patch.name = name;
  }
  if (body.color !== undefined) {
    if (typeof body.color !== "string" || !HEX.test(body.color)) {
      return NextResponse.json({ error: "color must be #rrggbb" }, { status: 400 });
    }
    patch.color = body.color;
  }
  try {
    const tag = updateTag(workspaceId, numericId, patch);
    if (!tag) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(tag);
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });
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
  const ok = deleteTag(workspaceId, numericId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
