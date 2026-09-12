import { describe, expect, it } from "vitest";
import { sanitizeError } from "./sanitize-error";

describe("sanitizeError", () => {
  it("redacts password values inside JSON-like payloads", () => {
    const out = sanitizeError(
      new Error('request failed: {"username":"dana","password":"hunter2"}')
    );
    expect(out).not.toContain("hunter2");
    expect(out).toContain('"password":"[REDACTED]"');
    expect(out).toContain('"username":"dana"');
  });

  it("redacts key=value credentials and long digit runs", () => {
    const out = sanitizeError(
      "login?id=012345678&password=hunter2 rejected for card 4580123412341234"
    );
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("012345678");
    expect(out).not.toContain("4580123412341234");
  });

  it("accepts plain strings, which is what scraper results carry", () => {
    expect(sanitizeError('{"password":"x"}')).toBe('{"password":"[REDACTED]"}');
  });

  it("falls back to a fixed message for non-error values", () => {
    expect(sanitizeError(undefined)).toBe("An unexpected error occurred");
    expect(sanitizeError({ password: "x" }, "custom")).toBe("custom");
  });
});
