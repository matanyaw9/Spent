import "server-only";

import type { BankProvider } from "@/lib/types";

export type TransactionKind = "expense" | "income" | "transfer";

const BANK_PROVIDERS_SET: ReadonlySet<BankProvider> = new Set<BankProvider>([
  "hapoalim",
  "leumi",
  "mizrahi",
  "discount",
  "mercantile",
  "beinleumi",
  "otsarHahayal",
  "pagi",
  "yahav",
  "massad",
  "union",
  "oneZero",
]);

export const CREDIT_CARD_PAYMENT_PATTERNS: readonly RegExp[] = [
  /ויזה/i,
  /ישראכרט/i,
  /ישרא[\s־-]?כארד/i,
  // Match כאל / כ.א.ל / כ א ל / כ-א-ל (Israeli abbreviation for Cal credit).
  /כ[\s.\-־]?א[\s.\-־]?ל/i,
  /מקסימום/i,
  // Max charges appear on bank statements as "מקס איט פיננסים"
  /מקס\s*איט/i,
  /מאסטרקארד/i,
  /אמריקן\s*אקספרס/i,
  /דיינרס/i,
  /תשלום\s*אשראי/i,
  /כרטיס\s*אשראי/i,
  /חיוב\s*כרטיס/i,
  /חיוב\s*לכרטיס/i,
  /\bISRACARD\b/i,
  /\bVISA\b/i,
  /\bMASTERCARD\b/i,
  /\bCAL\b/i,
  /\bMAX\b/i,
  /\bDINERS\b/i,
  /\bAMEX\b/i,
  /\bAMERICAN\s+EXPRESS\b/i,
];

// Bank-side aggregate lines for card activity that has not settled yet, e.g.
// Discount's "חיוב זמני למפתח מזומן". These carry no card number and resolve
// into a numbered card charge line once the billing cycle settles.
export const PENDING_CARD_AGGREGATE_PATTERNS: readonly RegExp[] = [
  /חיוב\s*זמני\s*למפתח/i,
];

export interface TrackedCards {
  /** account_number values seen on transactions from card providers */
  numbers: readonly string[];
  /** provider ids of card providers that have synced transactions */
  providers: readonly string[];
}

export type CardLineClassification =
  /** references a card we itemize elsewhere: the line is a transfer */
  | "tracked-card"
  /** pending aggregate for tracked cards: transfer, settles into a numbered line */
  | "pending-aggregate"
  /** looks like a card charge but no tracked card matches: keep as spending, flag */
  | "untracked-card"
  /** not a card charge line at all */
  | "not-card";

export function isBankProvider(provider: string): provider is BankProvider {
  return BANK_PROVIDERS_SET.has(provider as BankProvider);
}

function matchesTransferPattern(description: string): boolean {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return CREDIT_CARD_PAYMENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function last4(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * Classify a bank-side transaction line against the cards we actually track.
 *
 * Decision order: an explicit card-number match beats everything; a card-ish
 * line that matches no tracked card, or names no card at all, must NOT be
 * auto-excluded, because for an untracked card the aggregate charge is the
 * only record of that spending.
 */
export function classifyCardLine(
  description: string,
  tracked: TrackedCards
): CardLineClassification {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (!normalized) return "not-card";

  const hasTrackedCards =
    tracked.numbers.length > 0 || tracked.providers.length > 0;

  if (PENDING_CARD_AGGREGATE_PATTERNS.some((p) => p.test(normalized))) {
    return hasTrackedCards ? "pending-aggregate" : "untracked-card";
  }

  if (!matchesTransferPattern(normalized)) return "not-card";

  const trackedLast4 = new Set(
    tracked.numbers
      .map(last4)
      .filter((v): v is string => v !== null)
  );
  const runs = normalized.match(/\d{4,}/g) ?? [];
  for (const run of runs) {
    if (trackedLast4.has(run.slice(-4))) return "tracked-card";
  }
  // A card number is present but matches no tracked card: this is some other
  // card's aggregate charge. A company keyword must not override it; the safe
  // failure mode is counting it as spending and flagging, never excluding.
  if (runs.length > 0) return "untracked-card";

  // No card number at all. A company keyword alone cannot say WHICH card
  // the charge belongs to: the same provider can bill both a tracked card
  // (numbered lines) and an untracked one (generic lines). Per the safety
  // rule above, an ambiguous aggregate counts as spending and gets
  // flagged; the user can bulk-mark it as a transfer if it really is the
  // tracked card's bill, and that override sticks.
  return "untracked-card";
}

export function detectKind(
  description: string,
  provider: string,
  chargedAmount: number
): TransactionKind {
  if (isBankProvider(provider) && matchesTransferPattern(description)) {
    return "transfer";
  }
  if (isBankProvider(provider) && chargedAmount > 0) {
    return "income";
  }
  return "expense";
}
