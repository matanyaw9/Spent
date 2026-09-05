import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Spent never phones home. Next.js build/dev telemetry is opt-out, so opt
// out here for everyone who clones the repo (not just this machine).
process.env.NEXT_TELEMETRY_DISABLED ||= "1";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const SECURITY_HEADERS = [
  // Block embedding in iframes from other origins.
  { key: "X-Frame-Options", value: "DENY" },
  // Stop the browser from MIME-sniffing responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the originating URL on outbound links.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down browser capabilities this app never needs.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // CSP for a local-only app: everything is same-origin. Fonts are
  // self-hosted via next/font and bank logos ship in public/banks, so the
  // browser is only ever allowed to talk to the app itself. AI calls
  // (Anthropic API, local Ollama) happen server-side, never from the page.
  // Inline styles allowed for shadcn/Tailwind.
  // 'unsafe-inline' on scripts is necessary because Next dev injects them.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob:",
      // ws: is for Next dev-mode HMR only.
      "connect-src 'self' ws://127.0.0.1:* ws://localhost:*",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "israeli-bank-scrapers"],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
