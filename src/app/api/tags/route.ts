import { NextResponse } from "next/server";
import { createTag, listTags } from "@/server/db/queries/tags";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  return NextResponse.json(listTags(workspaceId));
}

export async function POST(request: Request) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "name is required (max 40 chars)" }, { status: 400 });
  }
  const color = typeof body.color === "string" && HEX.test(body.color) ? body.color : "#A2AAC2";
  try {
    return NextResponse.json(createTag(workspaceId, { name, color }), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "A tag with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
