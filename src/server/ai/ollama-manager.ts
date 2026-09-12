import "server-only";

import { spawn, type ChildProcess } from "child_process";

declare global {
  var _ollamaProcess: ChildProcess | undefined;
  var _ollamaExitHandlerRegistered: boolean | undefined;
}

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const INVALID_OLLAMA_URL_MESSAGE =
  "Invalid Ollama URL. Use the form http://host:11434.";

/**
 * Reduce a user-supplied Ollama URL to a bare http(s) origin. The value
 * comes straight from the settings form and becomes a server-side fetch
 * target, so anything that could steer the request elsewhere (userinfo,
 * path, query, fragment, other schemes) is dropped or rejected.
 */
export function normalizeOllamaUrl(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.origin;
}

// Every outbound call goes through here: normalized origin, fixed path, no
// redirect following, so a reachable host can't bounce us somewhere else.
function ollamaFetch(
  base: string,
  apiPath: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${base}${apiPath}`, { ...init, redirect: "error" });
}

async function isReachable(base: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await ollamaFetch(base, "/api/tags", {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForReachable(
  base: string,
  maxWaitMs: number
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isReachable(base)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export interface OllamaCheckResult {
  ok: boolean;
  error?: string;
  spawned?: boolean;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export async function listOllamaModels(url: string): Promise<string[]> {
  const base = normalizeOllamaUrl(url);
  if (!base) return [];
  try {
    const res = await ollamaFetch(base, "/api/tags", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

export async function isModelInstalled(
  url: string,
  model: string
): Promise<boolean> {
  const installed = await listOllamaModels(url);
  return installed.includes(model);
}

export async function* pullOllamaModel(
  url: string,
  model: string
): AsyncGenerator<OllamaPullProgress, void, unknown> {
  const base = normalizeOllamaUrl(url);
  if (!base) throw new Error(INVALID_OLLAMA_URL_MESSAGE);

  const res = await ollamaFetch(base, "/api/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama pull failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          yield JSON.parse(trimmed) as OllamaPullProgress;
        } catch {
          // skip malformed lines
        }
      }
    }
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim()) as OllamaPullProgress;
      } catch {
        // ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function ensureOllamaRunning(
  url: string
): Promise<OllamaCheckResult> {
  const base = normalizeOllamaUrl(url);
  if (!base) return { ok: false, error: INVALID_OLLAMA_URL_MESSAGE };

  if (await isReachable(base)) {
    return { ok: true };
  }

  if (globalThis._ollamaProcess && !globalThis._ollamaProcess.killed) {
    if (await waitForReachable(base, 5000)) {
      return { ok: true, spawned: true };
    }
  }

  console.log("[ollama] not reachable, attempting to spawn 'ollama serve'");

  try {
    const proc = spawn("ollama", ["serve"], {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[ollama serve] ${data.toString().trim()}`);
    });
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) console.log(`[ollama serve] ${text}`);
    });
    proc.on("error", (err) => {
      console.error("[ollama serve] process error:", err);
    });

    globalThis._ollamaProcess = proc;

    const errorOnSpawn = await new Promise<NodeJS.ErrnoException | null>(
      (resolve) => {
        const timer = setTimeout(() => resolve(null), 200);
        proc.once("error", (err) => {
          clearTimeout(timer);
          resolve(err as NodeJS.ErrnoException);
        });
      }
    );

    if (errorOnSpawn) {
      if (errorOnSpawn.code === "ENOENT") {
        return {
          ok: false,
          error:
            "Ollama is not installed. Install it from https://ollama.com, then try again.",
        };
      }
      return {
        ok: false,
        error: `Failed to start Ollama: ${errorOnSpawn.message}`,
      };
    }

    if (await waitForReachable(base, 10000)) {
      console.log("[ollama] up and running");
      return { ok: true, spawned: true };
    }

    return {
      ok: false,
      error:
        "Ollama was started but didn't respond within 10 seconds. Check if another process is using port 11434.",
    };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to start Ollama: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

if (!globalThis._ollamaExitHandlerRegistered) {
  globalThis._ollamaExitHandlerRegistered = true;
  const killChild = () => {
    if (globalThis._ollamaProcess && !globalThis._ollamaProcess.killed) {
      globalThis._ollamaProcess.kill();
    }
  };
  process.on("exit", killChild);
  process.on("SIGINT", () => {
    killChild();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    killChild();
    process.exit(0);
  });
}
