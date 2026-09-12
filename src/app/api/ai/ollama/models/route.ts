import { NextResponse } from "next/server";
import {
  DEFAULT_OLLAMA_URL,
  INVALID_OLLAMA_URL_MESSAGE,
  ensureOllamaRunning,
  listOllamaModels,
  normalizeOllamaUrl,
} from "@/server/ai/ollama-manager";
import { getGlobalSetting } from "@/server/db/queries/settings";

// POST, not GET: this can start `ollama serve` and makes a server-side
// request to the given URL, so it has to sit behind the same-origin check
// that only mutating methods get.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const url = normalizeOllamaUrl(
    body.url || getGlobalSetting("ai_ollama_url") || DEFAULT_OLLAMA_URL
  );
  if (!url) {
    return NextResponse.json(
      { models: [], error: INVALID_OLLAMA_URL_MESSAGE },
      { status: 400 }
    );
  }

  const status = await ensureOllamaRunning(url);
  if (!status.ok) {
    return NextResponse.json(
      { models: [], error: status.error },
      { status: 503 }
    );
  }

  const models = await listOllamaModels(url);
  return NextResponse.json({ models });
}
