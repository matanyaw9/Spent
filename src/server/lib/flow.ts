import "server-only";

/**
 * The money model, defined once. Every row is classified into exactly one
 * flow; every total on every screen is a sum over one or more flows.
 *
 *   spending        expense, not excluded, no pocket   -> counts as spending
 *   income          income, not excluded               -> counts as income
 *   investing       money into an investment pocket
 *   saving          money into a savings pocket
 *   debtRepayment   money into a loan pocket
 *   debtTaken       money out of a loan pocket
 *   cashWithdrawal  money into the cash pocket (an ATM withdrawal)
 *   pocketOut       money out of a cash/savings/investment pocket
 *   internal        transfer with no pocket (card billing, own accounts)
 *   excluded        is_excluded = 1, whatever else it is
 *
 * Amount sign convention follows the scrapers: negative is money leaving
 * the account, positive is money arriving.
 */
export type Flow =
  | "spending"
  | "income"
  | "investing"
  | "saving"
  | "debtRepayment"
  | "debtTaken"
  | "cashWithdrawal"
  | "pocketOut"
  | "internal"
  | "excluded";

export const FLOWS: Flow[] = [
  "spending",
  "income",
  "investing",
  "saving",
  "debtRepayment",
  "debtTaken",
  "cashWithdrawal",
  "pocketOut",
  "internal",
  "excluded",
];

/**
 * SQL CASE expression yielding the flow name. Expects the transactions
 * table aliased as `t` and pockets LEFT JOINed as `p` (see FLOW_JOIN).
 */
export const FLOW_CASE = `
  CASE
    WHEN t.is_excluded = 1 THEN 'excluded'
    WHEN t.pocket_id IS NOT NULL AND p.type = 'investment' AND t.charged_amount < 0 THEN 'investing'
    WHEN t.pocket_id IS NOT NULL AND p.type = 'savings' AND t.charged_amount < 0 THEN 'saving'
    WHEN t.pocket_id IS NOT NULL AND p.type = 'loan' AND t.charged_amount < 0 THEN 'debtRepayment'
    WHEN t.pocket_id IS NOT NULL AND p.type = 'loan' AND t.charged_amount >= 0 THEN 'debtTaken'
    WHEN t.pocket_id IS NOT NULL AND p.type = 'cash' AND t.charged_amount < 0 THEN 'cashWithdrawal'
    WHEN t.pocket_id IS NOT NULL AND t.charged_amount < 0 THEN 'internal'
    WHEN t.pocket_id IS NOT NULL THEN 'pocketOut'
    WHEN t.kind = 'transfer' THEN 'internal'
    WHEN t.kind = 'income' THEN 'income'
    ELSE 'spending'
  END`;

/** JOIN clause that FLOW_CASE depends on. */
export const FLOW_JOIN = `LEFT JOIN pockets p ON t.pocket_id = p.id`;
