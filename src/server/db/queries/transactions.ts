import "server-only";

import { randomUUID } from "node:crypto";
import { getDb } from "../index";
import { computeDedupHash } from "../../lib/dedup";
import {
  detectKind,
  classifyCardLine,
  isBankProvider,
  type TrackedCards,
} from "../../lib/transfers";
import { normalizeMerchant } from "../../lib/merchant-memory";
import { toJerusalemDay } from "../../lib/date-utils";
import type {
  TransactionWithCategory,
  MonthlySummary,
  MerchantSummary,
  CategoryBreakdown,
} from "@/lib/types";
import {
  isTransactionSortField,
  TRANSACTION_SORT_SQL,
} from "@/lib/transaction-sort";
export type TransactionKindFilter = "expense" | "income" | "transfer" | "all";

interface RawTransaction {
  accountNumber: string;
  date: string;
  processedDate: string;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency?: string;
  description: string;
  memo?: string;
  type: "normal" | "installments";
  status: "completed" | "pending";
  identifier?: string | number;
  installmentNumber?: number;
  installmentTotal?: number;
}

interface InsertResult {
  added: number;
  updated: number;
}

export function insertTransactions(
  workspaceId: number,
  transactions: RawTransaction[],
  provider: string,
  credentialId: number,
  syncRunId: number
): InsertResult {
  const db = getDb();
  let added = 0;
  let updated = 0;

  const hashCounts = new Map<string, number>();

  const existingCountStmt = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE workspace_id = ? AND dedup_hash = ?"
  );

  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      workspace_id, account_number, date, processed_date, original_amount, original_currency,
      charged_amount, charged_currency, description, memo, type, status,
      identifier, installment_number, installment_total, provider, credential_id,
      sync_run_id, dedup_hash, dedup_sequence, kind
    ) VALUES (
      @workspaceId, @accountNumber, @date, @processedDate, @originalAmount, @originalCurrency,
      @chargedAmount, @chargedCurrency, @description, @memo, @type, @status,
      @identifier, @installmentNumber, @installmentTotal, @provider, @credentialId,
      @syncRunId, @dedupHash, @dedupSequence, @kind
    )
    ON CONFLICT(workspace_id, dedup_hash, dedup_sequence) DO UPDATE SET
      status = CASE WHEN transactions.status = 'pending' THEN excluded.status ELSE transactions.status END,
      charged_amount = CASE WHEN transactions.status = 'pending' THEN excluded.charged_amount ELSE transactions.charged_amount END,
      processed_date = CASE WHEN transactions.status = 'pending' THEN excluded.processed_date ELSE transactions.processed_date END,
      kind = transactions.kind,
      updated_at = CASE WHEN transactions.status = 'pending' THEN datetime('now') ELSE transactions.updated_at END
  `);

  const batchInsert = db.transaction(() => {
    for (const txn of transactions) {
      // Normalize scraped timestamps to the Israel-local day BEFORE hashing
      // so the dedup hash stays stable across syncs (see toJerusalemDay).
      const txnDate = toJerusalemDay(txn.date);
      const processedDate = toJerusalemDay(txn.processedDate);
      const hash = computeDedupHash({
        accountNumber: txn.accountNumber,
        date: txnDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        description: txn.description,
        identifier: txn.identifier,
        installmentNumber: txn.installmentNumber,
        installmentTotal: txn.installmentTotal,
      });

      const batchCount = (hashCounts.get(hash) ?? 0) + 1;
      hashCounts.set(hash, batchCount);

      const { count: existingCount } = existingCountStmt.get(workspaceId, hash) as {
        count: number;
      };

      const sequence = batchCount - 1;
      const kind = detectKind(txn.description, provider, txn.chargedAmount);

      const params = {
        workspaceId,
        accountNumber: txn.accountNumber,
        date: txnDate,
        processedDate,
        originalAmount: txn.originalAmount,
        originalCurrency: txn.originalCurrency,
        chargedAmount: txn.chargedAmount,
        chargedCurrency: txn.chargedCurrency ?? null,
        description: txn.description,
        memo: txn.memo ?? null,
        type: txn.type,
        status: txn.status,
        identifier: txn.identifier != null ? String(txn.identifier) : null,
        installmentNumber: txn.installmentNumber ?? null,
        installmentTotal: txn.installmentTotal ?? null,
        provider,
        credentialId,
        syncRunId: syncRunId,
        dedupHash: hash,
        dedupSequence: sequence,
        kind,
      };

      if (batchCount > existingCount) {
        insertStmt.run(params);
        added++;
      } else {
        const result = insertStmt.run(params);
        if (result.changes > 0) {
          updated++;
        }
      }
    }
  });

  batchInsert();
  return { added, updated };
}

export interface ReclassifyResult {
  toTransfer: number;
  flaggedUntracked: number;
}

/**
 * Startup pass so classification improvements apply to existing data
 * immediately, without waiting for the next sync.
 */
export function reclassifyAllWorkspaces(): void {
  const workspaceIds = getDb()
    .prepare("SELECT id FROM workspaces")
    .all() as { id: number }[];
  for (const { id } of workspaceIds) {
    const result = reclassifyBankCardLines(id);
    if (result.toTransfer > 0 || result.flaggedUntracked > 0) {
      console.log(
        `[reclassify] workspace ${id}: ${result.toTransfer} to transfer, ${result.flaggedUntracked} flagged as untracked card charges`
      );
    }
  }
}

/**
 * Re-run card-aware transfer detection over all bank-side transactions.
 *
 * Runs after every sync so classification always reflects the full picture:
 * a card connected later retroactively converts its bank charge lines to
 * transfers. Only rows with kind_source = 'auto' are touched, so manual
 * kind overrides always win.
 */
export function reclassifyBankCardLines(workspaceId: number): ReclassifyResult {
  const db = getDb();

  const accounts = db
    .prepare(
      `SELECT DISTINCT provider, account_number as accountNumber
       FROM transactions
       WHERE workspace_id = ? AND account_number IS NOT NULL`
    )
    .all(workspaceId) as { provider: string; accountNumber: string }[];

  const cardAccounts = accounts.filter((a) => !isBankProvider(a.provider));
  const tracked: TrackedCards = {
    numbers: cardAccounts.map((a) => a.accountNumber),
    providers: [...new Set(cardAccounts.map((a) => a.provider))],
  };

  const rows = db
    .prepare(
      `SELECT id, provider, description, charged_amount as chargedAmount,
              kind, needs_review as needsReview
       FROM transactions
       WHERE workspace_id = ? AND kind_source = 'auto' AND is_excluded = 0`
    )
    .all(workspaceId) as {
    id: number;
    provider: string;
    description: string;
    chargedAmount: number;
    kind: "expense" | "income" | "transfer";
    needsReview: number;
  }[];

  const updateStmt = db.prepare(
    `UPDATE transactions
     SET kind = ?, needs_review = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  );

  const result: ReclassifyResult = { toTransfer: 0, flaggedUntracked: 0 };

  db.transaction(() => {
    for (const row of rows) {
      if (!isBankProvider(row.provider)) continue;

      const classification = classifyCardLine(row.description, tracked);
      if (classification === "not-card") continue;

      let kind: "expense" | "income" | "transfer";
      let needsReview: number;
      if (classification === "untracked-card") {
        kind = row.chargedAmount > 0 ? "income" : "expense";
        needsReview = 1;
      } else {
        kind = "transfer";
        needsReview = 0;
      }

      if (kind === row.kind && needsReview === row.needsReview) continue;
      updateStmt.run(kind, needsReview, workspaceId, row.id);
      if (kind === "transfer") {
        if (row.kind !== "transfer") result.toTransfer++;
      } else {
        result.flaggedUntracked++;
      }
    }
  })();

  return result;
}

/**
 * Apply a user's category choice to every other transaction of the same
 * merchant that the user hasn't categorized themselves. Complements merchant
 * memory, which only affects future syncs.
 */
export function applyCategoryToMerchant(
  workspaceId: number,
  description: string,
  categoryId: number,
  categoryKind: "expense" | "income"
): number {
  const key = normalizeMerchant(description);
  if (!key) return 0;

  const db = getDb();
  const candidates = db
    .prepare(
      `SELECT id, description FROM transactions
       WHERE workspace_id = ? AND kind = ? AND is_excluded = 0
         AND (category_source IS NULL OR category_source = 'ai')`
    )
    .all(workspaceId, categoryKind) as { id: number; description: string }[];

  const ids = candidates
    .filter((c) => normalizeMerchant(c.description) === key)
    .map((c) => c.id);
  if (ids.length === 0) return 0;

  const stmt = db.prepare(
    `UPDATE transactions
     SET category_id = ?, category_source = 'user', needs_review = 0,
         updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  );
  db.transaction(() => {
    for (const id of ids) stmt.run(categoryId, workspaceId, id);
  })();

  return ids.length;
}

export interface TransactionListFilter {
  from?: string;
  to?: string;
  search?: string;
  category?: number;
  /**
   * Multi-id filter for parent-category aggregation. Takes precedence over
   * `category` when present and non-empty. Use it to fetch transactions
   * across all children of a parent category.
   */
  categoryIds?: number[];
  kind?: TransactionKindFilter;
  provider?: string;
  /** @deprecated Use credentialIds */
  credentialId?: number;
  credentialIds?: number[];
  /**
   * Visibility of rows that don't count toward totals (excluded rows and
   * transfers, which are mostly card-billing duplicates of itemized card
   * spending): "hidden" drops them, "only" isolates them for review, and
   * "all"/unset shows everything.
   */
  notCounted?: "all" | "hidden" | "only";
  /** Magnitude bounds, applied to ABS(charged_amount). */
  amountMin?: number;
  amountMax?: number;
  /** Filter to specific cards/accounts (transactions.account_number). */
  accountNumbers?: string[];
}

interface QueryParams extends TransactionListFilter {
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

function appendCredentialIdsFilter(
  conditions: string[],
  values: (string | number)[],
  credentialIds: number[] | undefined,
  columnPrefix = ""
): void {
  if (!credentialIds || credentialIds.length === 0) return;
  const col = `${columnPrefix}credential_id`;
  const placeholders = credentialIds.map(() => "?").join(",");
  conditions.push(`${col} IN (${placeholders})`);
  for (const id of credentialIds) values.push(id);
}

function resolveSortSql(sort: string | undefined): string {
  if (isTransactionSortField(sort)) {
    return TRANSACTION_SORT_SQL[sort];
  }
  return TRANSACTION_SORT_SQL.date;
}

const TRANSACTION_LIST_FROM = `
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN bank_credentials bc ON t.credential_id = bc.id`;

const TRANSACTION_LIST_SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color,
         c.icon AS category_icon, bc.label AS account_label
  ${TRANSACTION_LIST_FROM}`;

function buildListConditions(
  workspaceId: number,
  params: TransactionListFilter
): { conditions: string[]; values: (string | number)[] } {
  const conditions: string[] = ["t.workspace_id = ?"];
  const values: (string | number)[] = [workspaceId];

  if (params.from) {
    conditions.push("t.date >= ?");
    values.push(params.from);
  }
  if (params.to) {
    conditions.push("t.date <= ?");
    values.push(params.to);
  }
  if (params.search) {
    conditions.push("(t.description LIKE ? OR t.memo LIKE ?)");
    const term = `%${params.search}%`;
    values.push(term, term);
  }
  if (params.categoryIds && params.categoryIds.length > 0) {
    const placeholders = params.categoryIds.map(() => "?").join(",");
    conditions.push(`t.category_id IN (${placeholders})`);
    for (const cid of params.categoryIds) values.push(cid);
  } else if (params.category !== undefined) {
    conditions.push("t.category_id = ?");
    values.push(params.category);
  }
  // Filter by the row's kind, not the amount sign, so the list agrees with
  // the kind-based totals (a transfer never shows under Income/Expenses).
  const kind: TransactionKindFilter = params.kind ?? "all";
  if (kind !== "all") {
    conditions.push("t.kind = ?");
    values.push(kind);
  }
  if (params.notCounted === "only") {
    conditions.push("(t.is_excluded = 1 OR t.kind = 'transfer')");
  } else if (params.notCounted === "hidden") {
    conditions.push("t.is_excluded = 0 AND t.kind != 'transfer'");
  }
  if (params.amountMin != null) {
    conditions.push("ABS(t.charged_amount) >= ?");
    values.push(params.amountMin);
  }
  if (params.amountMax != null) {
    conditions.push("ABS(t.charged_amount) <= ?");
    values.push(params.amountMax);
  }
  if (params.accountNumbers && params.accountNumbers.length > 0) {
    const placeholders = params.accountNumbers.map(() => "?").join(",");
    conditions.push(`t.account_number IN (${placeholders})`);
    for (const acc of params.accountNumbers) values.push(acc);
  }
  if (params.provider) {
    conditions.push("t.provider = ?");
    values.push(params.provider);
  }
  const credentialIds =
    params.credentialIds && params.credentialIds.length > 0
      ? params.credentialIds
      : params.credentialId != null
        ? [params.credentialId]
        : undefined;
  appendCredentialIdsFilter(conditions, values, credentialIds, "t.");

  return { conditions, values };
}

/**
 * Resolve a list filter to concrete transaction ids. Used by bulk actions
 * when the user selects "all matching" across pages.
 */
export function resolveFilteredTransactionIds(
  workspaceId: number,
  params: TransactionListFilter
): number[] {
  const { conditions, values } = buildListConditions(workspaceId, params);
  const rows = getDb()
    .prepare(
      `SELECT t.id FROM transactions t WHERE ${conditions.join(" AND ")}`
    )
    .all(...values) as { id: number }[];
  return rows.map((r) => r.id);
}

export function queryTransactions(
  workspaceId: number,
  params: QueryParams
): { transactions: TransactionWithCategory[]; total: number } {
  const db = getDb();
  const { conditions, values } = buildListConditions(workspaceId, params);
  const where = `WHERE ${conditions.join(" AND ")}`;

  const sortSql = resolveSortSql(params.sort);
  const sortOrder = params.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM transactions t ${where}`)
    .get(...values) as { total: number };

  const rows = db
    .prepare(
      `${TRANSACTION_LIST_SELECT}
       ${where}
       ORDER BY ${sortSql} ${sortOrder}, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset);

  return {
    transactions: rows.map(mapTransactionRow),
    total: countRow.total,
  };
}

export function getUncategorizedTransactionIds(workspaceId: number): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE workspace_id = ? AND category_id IS NULL AND kind != 'transfer' AND is_excluded = 0 ORDER BY date DESC"
    )
    .all(workspaceId) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getUncategorizedIdsByKind(
  workspaceId: number,
  kind: "expense" | "income"
): number[] {
  const rows = getDb()
    .prepare(
      "SELECT id FROM transactions WHERE workspace_id = ? AND category_id IS NULL AND kind = ? AND is_excluded = 0 ORDER BY date DESC"
    )
    .all(workspaceId, kind) as { id: number }[];
  return rows.map((r) => r.id);
}

export function getTransactionsForCategorization(
  workspaceId: number,
  ids: number[]
): { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null }[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb()
    .prepare(
      `SELECT id, description, charged_amount as chargedAmount,
              original_currency as originalCurrency, memo
       FROM transactions WHERE workspace_id = ? AND id IN (${placeholders})`
    )
    .all(workspaceId, ...ids) as { id: number; description: string; chargedAmount: number; originalCurrency: string; memo: string | null }[];
}

export function updateTransactionCategory(
  workspaceId: number,
  id: number,
  categoryId: number,
  source: "ai" | "user"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = ?, category_source = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(categoryId, source, workspaceId, id);
}

export function batchUpdateCategories(
  workspaceId: number,
  updates: { id: number; categoryId: number; aiConfidence?: number | null }[]
): void {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET category_id = ?, category_source = 'ai', ai_confidence = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ? AND category_source IS NOT 'user'`
  );

  db.transaction(() => {
    for (const { id, categoryId, aiConfidence } of updates) {
      stmt.run(categoryId, aiConfidence ?? null, workspaceId, id);
    }
  })();
}


export function getMonthlySummary(
  workspaceId: number,
  months: number
): MonthlySummary[] {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m', date) as month,
              SUM(ABS(charged_amount)) as amount
       FROM transactions
       WHERE workspace_id = ?
         AND date >= date('now', '-' || ? || ' months')
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0
       GROUP BY month
       ORDER BY month ASC`
    )
    .all(workspaceId, months) as MonthlySummary[];
}

export function getTopMerchants(
  workspaceId: number,
  from: string,
  to: string,
  limit = 10
): MerchantSummary[] {
  return getDb()
    .prepare(
      `SELECT description as name,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
         AND is_excluded = 0
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(workspaceId, from, to, limit) as MerchantSummary[];
}

export function getCategoryBreakdown(
  workspaceId: number,
  from: string,
  to: string
): CategoryBreakdown[] {
  return getDb()
    .prepare(
      `SELECT
         COALESCE(t.category_id, 0) as categoryId,
         COALESCE(c.name, 'Uncategorized') as name,
         COALESCE(c.color, '#B5B3AC') as color,
         SUM(ABS(t.charged_amount)) as amount,
         COUNT(*) as count
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.workspace_id = ? AND t.date >= ? AND t.date <= ? AND t.status = 'completed' AND t.kind = 'expense'
         AND t.is_excluded = 0
       GROUP BY t.category_id
       ORDER BY amount DESC`
    )
    .all(workspaceId, from, to) as CategoryBreakdown[];
}

export interface CategorySpend {
  categoryId: number;
  amount: number;
  count: number;
}

export function getCategorySpendInRange(
  workspaceId: number,
  from: string,
  to: string
): CategorySpend[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
         AND is_excluded = 0
       GROUP BY category_id`
    )
    .all(workspaceId, from, to) as CategorySpend[];
}

export interface CategoryTopMerchant {
  categoryId: number;
  merchant: string;
  amount: number;
}

export function getTopMerchantPerCategory(
  workspaceId: number,
  from: string,
  to: string
): CategoryTopMerchant[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, description as merchant, amount
       FROM (
         SELECT category_id, description, SUM(ABS(charged_amount)) as amount,
                ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY SUM(ABS(charged_amount)) DESC) as rn
         FROM transactions
         WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense' AND category_id IS NOT NULL
           AND is_excluded = 0
         GROUP BY category_id, description
       )
       WHERE rn = 1`
    )
    .all(workspaceId, from, to) as CategoryTopMerchant[];
}

export interface DailySpendPoint {
  date: string;
  amount: number;
}

export function getCategorySpendByDay(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string
): DailySpendPoint[] {
  return getDb()
    .prepare(
      `WITH RECURSIVE days(d) AS (
         SELECT date(?)
         UNION ALL
         SELECT date(d, '+1 day') FROM days WHERE d < date(?)
       )
       SELECT days.d as date,
              COALESCE(SUM(ABS(t.charged_amount)), 0) as amount
       FROM days
       LEFT JOIN transactions t
         ON substr(t.date, 1, 10) = days.d
         AND t.workspace_id = ?
         AND t.category_id = ?
         AND t.kind = 'expense'
         AND t.status = 'completed'
         AND t.is_excluded = 0
       GROUP BY days.d
       ORDER BY days.d ASC`
    )
    .all(from, to, workspaceId, categoryId) as DailySpendPoint[];
}

export interface TopMerchantForCategory {
  merchant: string;
  amount: number;
  count: number;
}

export function getTopMerchantsForCategory(
  workspaceId: number,
  categoryId: number,
  from: string,
  to: string,
  limit = 8
): TopMerchantForCategory[] {
  return getDb()
    .prepare(
      `SELECT description as merchant,
              SUM(ABS(charged_amount)) as amount,
              COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND category_id = ?
         AND date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
         AND is_excluded = 0
       GROUP BY description
       ORDER BY amount DESC
       LIMIT ?`
    )
    .all(workspaceId, categoryId, from, to, limit) as TopMerchantForCategory[];
}

export function getPeriodTotal(
  workspaceId: number,
  from: string,
  to: string
): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(ABS(charged_amount)), 0) as total
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
         AND is_excluded = 0`
    )
    .get(workspaceId, from, to) as { total: number };
  return row.total;
}

export function getPeriodCount(
  workspaceId: number,
  from: string,
  to: string
): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ? AND status = 'completed' AND kind = 'expense'
         AND is_excluded = 0`
    )
    .get(workspaceId, from, to) as { count: number };
  return row.count;
}

interface TransactionRow {
  id: number;
  account_number: string;
  date: string;
  processed_date: string;
  original_amount: number;
  original_currency: string;
  charged_amount: number;
  charged_currency: string | null;
  description: string;
  memo: string | null;
  type: string;
  status: string;
  identifier: string | null;
  installment_number: number | null;
  installment_total: number | null;
  category_id: number | null;
  category_source: string | null;
  ai_confidence: number | null;
  provider: string;
  credential_id: number | null;
  sync_run_id: number;
  kind: string;
  needs_review: number;
  is_excluded: number;
  created_at: string;
  updated_at: string;
  note: string | null;
  category_name?: string | null;
  category_color?: string | null;
  category_icon?: string | null;
  account_label?: string | null;
}

function mapTransactionRow(row: unknown): TransactionWithCategory {
  const r = row as TransactionRow;
  return {
    id: r.id,
    accountNumber: r.account_number,
    date: r.date,
    processedDate: r.processed_date,
    originalAmount: r.original_amount,
    originalCurrency: r.original_currency,
    chargedAmount: r.charged_amount,
    chargedCurrency: r.charged_currency,
    description: r.description,
    memo: r.memo,
    note: r.note ?? null,
    type: r.type as "normal" | "installments",
    status: r.status as "completed" | "pending",
    identifier: r.identifier,
    installmentNumber: r.installment_number,
    installmentTotal: r.installment_total,
    categoryId: r.category_id,
    categorySource: r.category_source as "ai" | "user" | null,
    aiConfidence: r.ai_confidence,
    provider: r.provider,
    credentialId: r.credential_id ?? null,
    accountLabel: r.account_label ?? null,
    syncRunId: r.sync_run_id,
    kind: r.kind as "expense" | "income" | "transfer",
    needsReview: r.needs_review === 1,
    isExcluded: r.is_excluded === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    categoryName: r.category_name ?? null,
    categoryColor: r.category_color ?? null,
    categoryIcon: r.category_icon ?? null,
  };
}

export function setTransactionKind(
  workspaceId: number,
  id: number,
  kind: "expense" | "income" | "transfer"
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET kind = ?, kind_source = 'user', updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(kind, workspaceId, id);
}

/**
 * One-time repair for rows synced before dates were normalized: convert
 * ISO-timestamp date/processed_date values to the Israel-local day and
 * recompute the dedup hash to match what future syncs will produce (the
 * hash covers the date, so leaving old hashes behind would re-import
 * every transaction as a duplicate). Idempotent: normalized rows carry
 * no 'T' in their dates and are never touched again.
 */
export function normalizeLegacyTransactionDates(): { updated: number } {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, workspace_id as workspaceId, account_number as accountNumber,
              date, processed_date as processedDate,
              original_amount as originalAmount,
              original_currency as originalCurrency, description, identifier,
              installment_number as installmentNumber,
              installment_total as installmentTotal
       FROM transactions
       WHERE date LIKE '%T%' OR processed_date LIKE '%T%'
       ORDER BY id`
    )
    .all() as {
    id: number;
    workspaceId: number;
    accountNumber: string;
    date: string;
    processedDate: string;
    originalAmount: number;
    originalCurrency: string;
    description: string;
    identifier: string | null;
    installmentNumber: number | null;
    installmentTotal: number | null;
  }[];
  if (rows.length === 0) return { updated: 0 };

  const existingCountStmt = db.prepare(
    `SELECT COUNT(*) as count FROM transactions
     WHERE workspace_id = ? AND dedup_hash = ? AND date NOT LIKE '%T%'`
  );
  const updateStmt = db.prepare(
    `UPDATE transactions
     SET date = ?, processed_date = ?, dedup_hash = ?, dedup_sequence = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  );

  db.transaction(() => {
    // Day-granularity can collapse hashes that time-granularity kept
    // distinct, so sequences are reassigned per (workspace, new hash),
    // seeded with any already-normalized rows holding that hash.
    const seqCounter = new Map<string, number>();
    for (const row of rows) {
      const newDate = toJerusalemDay(row.date);
      const newProcessed = toJerusalemDay(row.processedDate);
      const newHash = computeDedupHash({
        accountNumber: row.accountNumber,
        date: newDate,
        originalAmount: row.originalAmount,
        originalCurrency: row.originalCurrency,
        description: row.description,
        identifier: row.identifier,
        installmentNumber: row.installmentNumber,
        installmentTotal: row.installmentTotal,
      });
      const key = `${row.workspaceId}|${newHash}`;
      let seq = seqCounter.get(key);
      if (seq == null) {
        seq = (
          existingCountStmt.get(row.workspaceId, newHash) as { count: number }
        ).count;
      }
      updateStmt.run(newDate, newProcessed, newHash, seq, row.id);
      seqCounter.set(key, seq + 1);
    }
  })();

  console.log(
    `[db] normalized ${rows.length} transaction dates to Israel-local days`
  );
  return { updated: rows.length };
}

export interface TransactionAccount {
  provider: string;
  accountNumber: string;
  count: number;
  nickname: string | null;
}

/** Distinct cards/accounts that appear on this workspace's transactions. */
export function listTransactionAccounts(
  workspaceId: number
): TransactionAccount[] {
  return getDb()
    .prepare(
      `SELECT t.provider, t.account_number as accountNumber, COUNT(*) as count,
              cn.nickname as nickname
       FROM transactions t
       LEFT JOIN card_nicknames cn
         ON cn.workspace_id = t.workspace_id
        AND cn.account_number = t.account_number
       WHERE t.workspace_id = ?
       GROUP BY t.provider, t.account_number
       ORDER BY t.provider, t.account_number`
    )
    .all(workspaceId) as TransactionAccount[];
}

/**
 * Manual entries (cash and the like) have no scraper run behind them, but
 * sync_run_id is NOT NULL, so each workspace lazily gets one synthetic
 * completed run that all manual rows hang off.
 */
function getOrCreateManualSyncRun(workspaceId: number): number {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM sync_runs
       WHERE workspace_id = ? AND provider = 'manual'
       LIMIT 1`
    )
    .get(workspaceId) as { id: number } | undefined;
  if (existing) return existing.id;
  const result = db
    .prepare(
      `INSERT INTO sync_runs (workspace_id, provider, started_at, completed_at, status, scrape_from_date)
       VALUES (?, 'manual', datetime('now'), datetime('now'), 'completed', date('now'))`
    )
    .run(workspaceId);
  return Number(result.lastInsertRowid);
}

export interface ManualTransactionInput {
  date: string;
  /** Magnitude; the kind decides the sign. */
  amount: number;
  kind: "expense" | "income" | "transfer";
  description: string;
  categoryId?: number | null;
  memo?: string | null;
}

export function createManualTransaction(
  workspaceId: number,
  input: ManualTransactionInput
): number {
  const syncRunId = getOrCreateManualSyncRun(workspaceId);
  const magnitude = Math.abs(input.amount);
  const chargedAmount = input.kind === "income" ? magnitude : -magnitude;
  const result = getDb()
    .prepare(
      `INSERT INTO transactions (
         workspace_id, account_number, date, processed_date,
         original_amount, original_currency, charged_amount, description,
         memo, type, status, provider, sync_run_id, dedup_hash,
         dedup_sequence, kind, kind_source, category_id, category_source,
         needs_review
       ) VALUES (?, 'cash', ?, ?, ?, 'ILS', ?, ?, ?, 'normal', 'completed',
                 'manual', ?, ?, 0, ?, 'user', ?, ?, 0)`
    )
    .run(
      workspaceId,
      input.date,
      input.date,
      chargedAmount,
      chargedAmount,
      input.description,
      input.memo ?? null,
      syncRunId,
      `manual-${randomUUID()}`,
      input.kind,
      input.categoryId ?? null,
      input.categoryId != null ? "user" : null
    );
  return Number(result.lastInsertRowid);
}

export function deleteManualTransaction(
  workspaceId: number,
  id: number
): boolean {
  const result = getDb()
    .prepare(
      `DELETE FROM transactions
       WHERE workspace_id = ? AND id = ? AND provider = 'manual'`
    )
    .run(workspaceId, id);
  return result.changes > 0;
}

/** Chunk ids so IN (...) never exceeds SQLite's bound-variable limit. */
function chunkIds(ids: number[], size = 500): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export function bulkSetTransactionKind(
  workspaceId: number,
  ids: number[],
  kind: "expense" | "income" | "transfer"
): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  let updated = 0;
  db.transaction(() => {
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = db
        .prepare(
          `UPDATE transactions
           SET kind = ?, kind_source = 'user', updated_at = datetime('now')
           WHERE workspace_id = ? AND id IN (${placeholders})`
        )
        .run(kind, workspaceId, ...chunk);
      updated += result.changes;
    }
  })();
  return updated;
}

export function bulkSetTransactionExcluded(
  workspaceId: number,
  ids: number[],
  excluded: boolean
): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  let updated = 0;
  db.transaction(() => {
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = db
        .prepare(
          `UPDATE transactions
           SET is_excluded = ?, updated_at = datetime('now')
           WHERE workspace_id = ? AND id IN (${placeholders})`
        )
        .run(excluded ? 1 : 0, workspaceId, ...chunk);
      updated += result.changes;
    }
  })();
  return updated;
}

export interface BulkCategoryResult {
  updated: number;
  skipped: number;
  /** Distinct merchant descriptions among the updated rows. */
  merchants: string[];
}

/**
 * Assign a category to many transactions at once. Only rows whose kind
 * matches the category's kind are touched; the rest are reported as
 * skipped so the UI can say so. Unlike the single-row flow, this never
 * cascades to unselected transactions of the same merchant: a bulk edit
 * should change exactly what the user selected.
 */
export function bulkAssignCategory(
  workspaceId: number,
  ids: number[],
  categoryId: number,
  categoryKind: "expense" | "income"
): BulkCategoryResult {
  if (ids.length === 0) return { updated: 0, skipped: 0, merchants: [] };
  const db = getDb();
  let updated = 0;
  const merchants = new Set<string>();

  db.transaction(() => {
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT DISTINCT description FROM transactions
           WHERE workspace_id = ? AND kind = ? AND id IN (${placeholders})`
        )
        .all(workspaceId, categoryKind, ...chunk) as { description: string }[];
      for (const row of rows) merchants.add(row.description);

      const result = db
        .prepare(
          `UPDATE transactions
           SET category_id = ?, category_source = 'user', needs_review = 0,
               updated_at = datetime('now')
           WHERE workspace_id = ? AND kind = ? AND id IN (${placeholders})`
        )
        .run(categoryId, workspaceId, categoryKind, ...chunk);
      updated += result.changes;
    }
  })();

  return {
    updated,
    skipped: ids.length - updated,
    merchants: [...merchants],
  };
}

export function setTransactionNote(
  workspaceId: number,
  id: number,
  note: string | null
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE transactions
       SET note = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(note, workspaceId, id);
  return result.changes > 0;
}

export function clearTransactionCategory(
  workspaceId: number,
  id: number
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET category_id = NULL, category_source = NULL, needs_review = 0,
           updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, id);
}

export function bulkClearCategory(workspaceId: number, ids: number[]): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  let updated = 0;
  db.transaction(() => {
    for (const chunk of chunkIds(ids)) {
      const placeholders = chunk.map(() => "?").join(",");
      const result = db
        .prepare(
          `UPDATE transactions
           SET category_id = NULL, category_source = NULL, needs_review = 0,
               updated_at = datetime('now')
           WHERE workspace_id = ? AND id IN (${placeholders})`
        )
        .run(workspaceId, ...chunk);
      updated += result.changes;
    }
  })();
  return updated;
}

export function setTransactionNeedsReview(
  workspaceId: number,
  id: number,
  value: boolean
): void {
  getDb()
    .prepare(
      `UPDATE transactions
       SET needs_review = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(value ? 1 : 0, workspaceId, id);
}

interface TransactionContext {
  id: number;
  description: string;
  categoryId: number | null;
  categorySource: "ai" | "user" | null;
  kind: "expense" | "income" | "transfer";
  provider: string;
}

export function getTransactionContext(
  workspaceId: number,
  id: number
): TransactionContext | null {
  const row = getDb()
    .prepare(
      `SELECT id, description, category_id as categoryId,
              category_source as categorySource, kind, provider
       FROM transactions WHERE workspace_id = ? AND id = ?`
    )
    .get(workspaceId, id) as TransactionContext | undefined;
  return row ?? null;
}

export function batchSetNeedsReview(
  workspaceId: number,
  updates: { id: number; needsReview: boolean }[]
): void {
  if (updates.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE transactions
     SET needs_review = ?, updated_at = datetime('now')
     WHERE workspace_id = ? AND id = ?`
  );
  db.transaction(() => {
    for (const { id, needsReview } of updates) {
      stmt.run(needsReview ? 1 : 0, workspaceId, id);
    }
  })();
}

export interface NeedsReviewCount {
  categoryId: number;
  count: number;
}

export interface TransactionsSummary {
  income: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  expense: {
    total: number;
    count: number;
    largest: TransactionWithCategory | null;
  };
  net: number;
  topMerchants: { description: string; total: number; count: number }[];
  pendingReviewCount: number;
  /** Rows in range that don't count toward the totals above. */
  notCounted: {
    count: number;
    total: number;
    excludedCount: number;
    transferCount: number;
  };
}

export interface TransactionsSummaryParams {
  /** @deprecated Use credentialIds */
  credentialId?: number;
  credentialIds?: number[];
}

export function getTransactionsSummary(
  workspaceId: number,
  from: string,
  to: string,
  params: TransactionsSummaryParams = {}
): TransactionsSummary {
  const db = getDb();
  const baseConditions = [
    "workspace_id = ?",
    "date >= ?",
    "date <= ?",
    "status = 'completed'",
    "is_excluded = 0",
  ];
  const baseValues: (string | number)[] = [workspaceId, from, to];
  const summaryCredentialIds =
    params.credentialIds && params.credentialIds.length > 0
      ? params.credentialIds
      : params.credentialId != null
        ? [params.credentialId]
        : undefined;
  appendCredentialIdsFilter(baseConditions, baseValues, summaryCredentialIds);
  const baseWhere = baseConditions.join(" AND ");

  // Income and expenses go by the row's kind, matching the dashboard and
  // budget math. Transfers count in neither; signed sums let a refund
  // (positive amount on an expense row) reduce spending instead of adding
  // to it.
  const incomeAgg = db
    .prepare(
      `SELECT COALESCE(SUM(charged_amount), 0) as total, COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND kind = 'income'`
    )
    .get(...baseValues) as { total: number; count: number };

  const expenseAgg = db
    .prepare(
      `SELECT COALESCE(SUM(-charged_amount), 0) as total, COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND kind = 'expense'`
    )
    .get(...baseValues) as { total: number; count: number };

  const pickLargest = (kind: "income" | "expense"): TransactionWithCategory | null => {
    const tConditions = [
      "t.workspace_id = ?",
      "t.date >= ?",
      "t.date <= ?",
      "t.status = 'completed'",
      "t.is_excluded = 0",
      "t.kind = ?",
    ];
    const tValues: (string | number)[] = [workspaceId, from, to, kind];
    appendCredentialIdsFilter(tConditions, tValues, summaryCredentialIds, "t.");
    const row = db
      .prepare(
        `${TRANSACTION_LIST_SELECT}
         WHERE ${tConditions.join(" AND ")}
         ORDER BY ABS(t.charged_amount) DESC, t.id DESC
         LIMIT 1`
      )
      .get(...tValues);
    return row ? mapTransactionRow(row) : null;
  };

  const topMerchantsRows = db
    .prepare(
      `SELECT description,
              SUM(-charged_amount) as total,
              COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND kind = 'expense'
       GROUP BY description
       ORDER BY total DESC
       LIMIT 5`
    )
    .all(...baseValues) as { description: string; total: number; count: number }[];

  // Same range and account scope, but the complement of the base filter:
  // rows the totals above deliberately leave out.
  const ncConditions = ["workspace_id = ?", "date >= ?", "date <= ?", "status = 'completed'"];
  const ncValues: (string | number)[] = [workspaceId, from, to];
  appendCredentialIdsFilter(ncConditions, ncValues, summaryCredentialIds);
  const notCounted = db
    .prepare(
      `SELECT COUNT(*) as count,
              COALESCE(SUM(ABS(charged_amount)), 0) as total,
              COALESCE(SUM(is_excluded), 0) as excludedCount,
              COALESCE(SUM(CASE WHEN is_excluded = 0 AND kind = 'transfer' THEN 1 ELSE 0 END), 0) as transferCount
       FROM transactions
       WHERE ${ncConditions.join(" AND ")}
         AND (is_excluded = 1 OR kind = 'transfer')`
    )
    .get(...ncValues) as {
    count: number;
    total: number;
    excludedCount: number;
    transferCount: number;
  };

  const pendingReview = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM transactions
       WHERE ${baseWhere} AND needs_review = 1`
    )
    .get(...baseValues) as { count: number };

  return {
    income: {
      total: incomeAgg.total,
      count: incomeAgg.count,
      largest: pickLargest("income"),
    },
    expense: {
      total: expenseAgg.total,
      count: expenseAgg.count,
      largest: pickLargest("expense"),
    },
    net: incomeAgg.total - expenseAgg.total,
    topMerchants: topMerchantsRows,
    pendingReviewCount: pendingReview.count,
    notCounted,
  };
}

export function getNeedsReviewCountByCategory(
  workspaceId: number,
  from: string,
  to: string
): NeedsReviewCount[] {
  return getDb()
    .prepare(
      `SELECT category_id as categoryId, COUNT(*) as count
       FROM transactions
       WHERE workspace_id = ? AND date >= ? AND date <= ?
         AND status = 'completed'
         AND kind = 'expense'
         AND needs_review = 1
         AND category_id IS NOT NULL
       GROUP BY category_id`
    )
    .all(workspaceId, from, to) as NeedsReviewCount[];
}
