import "server-only";

/**
 * Strip credential-looking material from an error before it is logged or
 * returned to the client. Scraper errors can embed the request payload that
 * failed (ID number, card digits, password), so every log line and every API
 * error message that originates from a scrape must pass through here first.
 */
export function sanitizeErrorMessage(message: string): string {
  let msg = message;
  // Strip 5+ digit numbers (likely ID numbers, card digits, etc.)
  msg = msg.replace(/\b\d{5,}\b/g, "[REDACTED]");
  // Strip password and id values from JSON-like blobs.
  msg = msg.replace(
    /"(password|id|card6Digits|cardSuffix|otpLongTermToken)"\s*:\s*"[^"]*"/gi,
    '"$1":"[REDACTED]"'
  );
  // Strip key=value forms.
  msg = msg.replace(
    /\b(password|id|card6Digits|cardSuffix|otpLongTermToken)\s*=\s*\S+/gi,
    "$1=[REDACTED]"
  );
  return msg;
}

export function sanitizeError(
  error: unknown,
  fallback = "An unexpected error occurred"
): string {
  if (error instanceof Error) return sanitizeErrorMessage(error.message);
  if (typeof error === "string") return sanitizeErrorMessage(error);
  return fallback;
}
