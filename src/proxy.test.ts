import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

// The proxy is the only thing between a malicious web page and a local API
// that holds bank credentials. These tests pin both guards so a refactor
// cannot quietly loosen them.

const APP = "http://spent.localhost:41234";

function run(
  url: string,
  init: { method?: string; headers?: Record<string, string> } = {}
) {
  return proxy(
    new NextRequest(url, { method: init.method ?? "GET", headers: init.headers })
  );
}

function expectPassThrough(res: Response) {
  expect(res.status).toBe(200);
  expect(res.headers.get("x-middleware-next")).toBe("1");
}

describe("proxy: Host allowlist (DNS rebinding)", () => {
  it("rejects a GET whose Host is not a loopback name", () => {
    const res = run(`${APP}/api/integrations/1`, {
      headers: { host: "evil.com:41234" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a missing Host header", () => {
    const res = run(`${APP}/api/health`);
    expect(res.status).toBe(403);
  });

  it("rejects a hostname smuggled through userinfo", () => {
    const res = run(`${APP}/api/health`, {
      headers: { host: "spent.localhost:41234@evil.com" },
    });
    expect(res.status).toBe(403);
  });

  it("applies to pages, not only the API", () => {
    const res = run(`${APP}/settings/bank`, {
      headers: { host: "evil.com:41234" },
    });
    expect(res.status).toBe(403);
  });

  it.each([
    "spent.localhost:41234",
    "127.0.0.1:41234",
    "localhost:3000",
    "[::1]:41234",
  ])("allows Host %s", (host) => {
    expectPassThrough(run(`${APP}/api/health`, { headers: { host } }));
  });
});

describe("proxy: same-origin check on mutating API requests", () => {
  const host = "spent.localhost:41234";

  it("rejects a POST from another origin", () => {
    const res = run(`${APP}/api/sync`, {
      method: "POST",
      headers: { host, origin: "http://evil.com" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a POST with neither Origin nor Referer", () => {
    const res = run(`${APP}/api/sync`, { method: "POST", headers: { host } });
    expect(res.status).toBe(403);
  });

  it("rejects a DELETE whose Referer is another origin", () => {
    const res = run(`${APP}/api/integrations/1`, {
      method: "DELETE",
      headers: { host, referer: "http://evil.com/page" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts a POST from our own origin", () => {
    expectPassThrough(
      run(`${APP}/api/sync`, {
        method: "POST",
        headers: { host, origin: APP },
      })
    );
  });

  it("accepts a POST whose Referer is our own page when Origin is absent", () => {
    expectPassThrough(
      run(`${APP}/api/sync`, {
        method: "POST",
        headers: { host, referer: `${APP}/settings/bank` },
      })
    );
  });

  it("leaves non-API POSTs (server actions, form posts) alone", () => {
    expectPassThrough(
      run(`${APP}/setup`, { method: "POST", headers: { host } })
    );
  });
});
