import { NextResponse, type NextRequest } from "next/server";

/**
 * Two request-level guards for a server that only ever binds to loopback.
 *
 * 1. Host allowlist, every request. A page on evil.com can re-point that
 *    name at 127.0.0.1 after it loads (DNS rebinding). The browser then
 *    treats evil.com:41234 as the page's own origin and lets its scripts
 *    read our API responses. The one thing the page cannot forge is the
 *    Host header, so we refuse any hostname that isn't a loopback name we
 *    chose. Pages server-render data too, so this covers every path.
 *
 * 2. Same-origin check, mutating API requests. Any webpage can fire a POST
 *    at http://127.0.0.1:41234/api/sync from inside your browser. Origin
 *    (or Referer, when Origin is absent) must match our own Host so a
 *    malicious tab can't trigger syncs, delete integrations, or apply
 *    categorizations.
 *
 * Both guards are pinned by src/proxy.test.ts.
 */

const ALLOWED_HOSTNAMES = new Set([
  "localhost",
  "spent.localhost",
  "127.0.0.1",
  "[::1]",
]);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hostnameOf(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  try {
    // WHATWG parsing handles ports, IPv6 brackets, and rejects userinfo
    // tricks like "spent.localhost:41234@evil.com" (hostname = evil.com).
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const hostname = hostnameOf(host);
  if (!hostname || !ALLOWED_HOSTNAMES.has(hostname)) {
    return new NextResponse("Forbidden: unexpected Host header", {
      status: 403,
    });
  }

  if (
    !MUTATING_METHODS.has(request.method) ||
    !request.nextUrl.pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  // SSE streams use POST too (sync), but they're still subject to the
  // same-origin requirement, so no exception needed.

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (!origin && !referer) {
    return new NextResponse("Forbidden: missing origin/referer", {
      status: 403,
    });
  }

  const matchesHost = (value: string | null): boolean => {
    if (!value) return false;
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  };

  if (origin && !matchesHost(origin)) {
    return new NextResponse("Forbidden: cross-origin request blocked", {
      status: 403,
    });
  }
  if (!origin && referer && !matchesHost(referer)) {
    return new NextResponse("Forbidden: cross-origin referer", {
      status: 403,
    });
  }

  return NextResponse.next();
}

// No matcher on purpose: the Host check has to run on every path, static
// assets included. It is a few string comparisons per request.
