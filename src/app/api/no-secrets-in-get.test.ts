import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

// Every GET route under src/app/api is called against a database that holds
// a bank password and a Claude API key, both unmistakable canary strings.
// If any response body (or thrown error) contains a canary, a route is
// handing stored secrets to whoever can reach the port. Routes may fail or
// return 4xx here; they may not leak. A new route that leaks fails this
// test, not a code review.

const BANK_PASSWORD = "CANARY-BANK-PASSWORD-a7f31c";
const CLAUDE_KEY = "sk-ant-CANARY-CLAUDE-KEY-b9e02d";
const WS = 1;

const API_DIR = fileURLToPath(new URL(".", import.meta.url));

type RouteModule = {
  GET?: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response> | Response;
};

function findGetRoutes(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findGetRoutes(full));
    } else if (
      entry.name === "route.ts" &&
      /export (async )?function GET\b/.test(fs.readFileSync(full, "utf-8"))
    ) {
      found.push(full);
    }
  }
  return found.sort();
}

function requestFor(file: string): Request {
  const rel = path
    .relative(API_DIR, path.dirname(file))
    .replace(/\[id\]/g, "1");
  return new Request(`http://spent.localhost:41234/api/${rel}`, {
    headers: { host: "spent.localhost:41234", "x-workspace-id": String(WS) },
  });
}

const routes = findGetRoutes(API_DIR);

let db: Database.Database;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spent-secrets-test-"));
  process.env.SPENT_DATA_DIR = tmpDir;
  const dbModule = await import("@/server/db");
  db = dbModule.getDb();

  const { saveBankCredentials } = await import(
    "@/server/db/queries/bank-credentials"
  );
  saveBankCredentials(
    WS,
    "cal",
    { username: "canary-user", password: BANK_PASSWORD },
    { label: "Canary" }
  );

  const { setGlobalSetting } = await import("@/server/db/queries/settings");
  const { encrypt } = await import("@/server/lib/encryption");
  const { encrypted, iv, authTag } = encrypt(CLAUDE_KEY);
  setGlobalSetting("ai_provider", "claude");
  setGlobalSetting("ai_api_key_encrypted", encrypted.toString("hex"));
  setGlobalSetting("ai_api_key_iv", iv.toString("hex"));
  setGlobalSetting("ai_api_key_auth_tag", authTag.toString("hex"));
});

afterAll(() => {
  db.close();
  globalThis._db = undefined;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GET routes never return stored secrets", () => {
  it("discovers the GET routes", () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes.map((f) => [path.relative(API_DIR, f), f]))(
    "%s",
    async (_name, file) => {
      const mod = (await import(/* @vite-ignore */ file)) as RouteModule;
      expect(mod.GET).toBeTypeOf("function");

      let body: string;
      try {
        const res = await Promise.race([
          Promise.resolve(mod.GET!(requestFor(file), {
            params: Promise.resolve({ id: "1" }),
          })),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("route timed out")), 5000)
          ),
        ]);
        body = await res.text();
      } catch (err) {
        body = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      }

      expect(body).not.toContain(BANK_PASSWORD);
      expect(body).not.toContain(CLAUDE_KEY);
    }
  );

  it("integrations/[id] reports the password as stored without returning it", async () => {
    const file = path.join(API_DIR, "integrations", "[id]", "route.ts");
    const mod = (await import(/* @vite-ignore */ file)) as RouteModule;
    const res = await mod.GET!(requestFor(file), {
      params: Promise.resolve({ id: "1" }),
    });
    const json = (await res.json()) as {
      credentials: Record<string, string>;
      storedSecrets: string[];
    };
    expect(json.credentials).toEqual({ username: "canary-user" });
    expect(json.storedSecrets).toEqual(["password"]);
  });
});
