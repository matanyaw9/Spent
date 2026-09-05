import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";

// These tests run the real migrations against a throwaway database, then
// exercise the bulk mutations and filter resolution end to end. The data
// dir env var must be set before the db module is imported, hence the
// dynamic imports in beforeAll.

let db: Database.Database;
let queries: typeof import("./transactions");
let tmpDir: string;

const WS = 1;
let expenseCategoryId: number;
let incomeCategoryId: number;
let seq = 0;

interface SeedTxn {
  amount: number;
  kind: "expense" | "income" | "transfer";
  excluded?: boolean;
  description?: string;
  date?: string;
  accountNumber?: string;
}

function insertTxn(t: SeedTxn): number {
  seq++;
  const date = t.date ?? "2026-01-15";
  const result = db
    .prepare(
      `INSERT INTO transactions (
         workspace_id, account_number, date, processed_date,
         original_amount, original_currency, charged_amount, description,
         type, status, provider, sync_run_id, dedup_hash, dedup_sequence,
         kind, is_excluded
       ) VALUES (?, ?, ?, ?, ?, 'ILS', ?, ?, 'normal', 'completed',
                 'isracard', 1, ?, 0, ?, ?)`
    )
    .run(
      WS,
      t.accountNumber ?? "1234",
      date,
      date,
      t.amount,
      t.amount,
      t.description ?? `merchant-${seq}`,
      `hash-${seq}`,
      t.kind,
      t.excluded ? 1 : 0
    );
  return Number(result.lastInsertRowid);
}

function getRow(id: number) {
  return db
    .prepare(
      `SELECT kind, kind_source, is_excluded, category_id, category_source,
              needs_review
       FROM transactions WHERE id = ?`
    )
    .get(id) as {
    kind: string;
    kind_source: string;
    is_excluded: number;
    category_id: number | null;
    category_source: string | null;
    needs_review: number;
  };
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spent-bulk-test-"));
  process.env.SPENT_DATA_DIR = tmpDir;
  const dbModule = await import("../index");
  db = dbModule.getDb();
  queries = await import("./transactions");

  db.prepare(
    `INSERT INTO sync_runs (id, workspace_id, provider, started_at, status, scrape_from_date)
     VALUES (1, 1, 'isracard', datetime('now'), 'completed', '2026-01-01')`
  ).run();

  const categories = db
    .prepare(`SELECT id, kind FROM categories ORDER BY id`)
    .all() as { id: number; kind: string }[];
  expenseCategoryId = categories.find((c) => c.kind === "expense")!.id;
  incomeCategoryId = categories.find((c) => c.kind === "income")!.id;
});

afterAll(() => {
  db.close();
  globalThis._db = undefined;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("bulkSetTransactionKind", () => {
  it("updates only the given ids and marks the override as user-made", () => {
    const a = insertTxn({ amount: -50, kind: "expense" });
    const b = insertTxn({ amount: -60, kind: "expense" });

    const updated = queries.bulkSetTransactionKind(WS, [a], "transfer");

    expect(updated).toBe(1);
    expect(getRow(a)).toMatchObject({ kind: "transfer", kind_source: "user" });
    expect(getRow(b)).toMatchObject({ kind: "expense", kind_source: "auto" });
  });

  it("never touches rows of another workspace", () => {
    const a = insertTxn({ amount: -50, kind: "expense" });
    const updated = queries.bulkSetTransactionKind(999, [a], "income");
    expect(updated).toBe(0);
    expect(getRow(a).kind).toBe("expense");
  });
});

describe("bulkSetTransactionExcluded", () => {
  it("toggles is_excluded for all given ids", () => {
    const a = insertTxn({ amount: -10, kind: "expense" });
    const b = insertTxn({ amount: -20, kind: "expense" });

    expect(queries.bulkSetTransactionExcluded(WS, [a, b], true)).toBe(2);
    expect(getRow(a).is_excluded).toBe(1);
    expect(getRow(b).is_excluded).toBe(1);

    expect(queries.bulkSetTransactionExcluded(WS, [a], false)).toBe(1);
    expect(getRow(a).is_excluded).toBe(0);
    expect(getRow(b).is_excluded).toBe(1);
  });
});

describe("bulkAssignCategory", () => {
  it("categorizes kind-matching rows and reports the rest as skipped", () => {
    const expense = insertTxn({
      amount: -30,
      kind: "expense",
      description: "coffee shop",
    });
    const income = insertTxn({ amount: 100, kind: "income" });
    const transfer = insertTxn({ amount: -500, kind: "transfer" });

    const result = queries.bulkAssignCategory(
      WS,
      [expense, income, transfer],
      expenseCategoryId,
      "expense"
    );

    expect(result).toMatchObject({ updated: 1, skipped: 2 });
    expect(result.merchants).toEqual(["coffee shop"]);
    expect(getRow(expense)).toMatchObject({
      category_id: expenseCategoryId,
      category_source: "user",
      needs_review: 0,
    });
    expect(getRow(income).category_id).toBeNull();
    expect(getRow(transfer).category_id).toBeNull();
  });

  it("assigns income categories to income rows", () => {
    const income = insertTxn({ amount: 9000, kind: "income" });
    const result = queries.bulkAssignCategory(
      WS,
      [income],
      incomeCategoryId,
      "income"
    );
    expect(result.updated).toBe(1);
    expect(getRow(income).category_id).toBe(incomeCategoryId);
  });
});

describe("resolveFilteredTransactionIds", () => {
  const range = { from: "2029-05-01", to: "2029-05-31" };

  it("filters by kind, not by amount sign", () => {
    const refund = insertTxn({
      amount: 50,
      kind: "expense",
      date: "2029-05-10",
    });
    const salary = insertTxn({
      amount: 8000,
      kind: "income",
      date: "2029-05-11",
    });

    const incomeIds = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      kind: "income",
    });
    expect(incomeIds).toContain(salary);
    expect(incomeIds).not.toContain(refund);

    const expenseIds = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      kind: "expense",
    });
    expect(expenseIds).toContain(refund);
  });

  it("notCounted returns exactly the excluded and transfer rows", () => {
    const counted = insertTxn({
      amount: -70,
      kind: "expense",
      date: "2029-05-12",
    });
    const excluded = insertTxn({
      amount: -80,
      kind: "expense",
      excluded: true,
      date: "2029-05-13",
    });
    const transfer = insertTxn({
      amount: -90,
      kind: "transfer",
      date: "2029-05-14",
    });

    const ids = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      notCounted: true,
    });
    expect(ids).toContain(excluded);
    expect(ids).toContain(transfer);
    expect(ids).not.toContain(counted);
  });
});

describe("advanced list filters", () => {
  const range = { from: "2031-03-01", to: "2031-03-31" };

  it("excluded tri-state hides or isolates excluded rows", () => {
    const kept = insertTxn({ amount: -10, kind: "expense", date: "2031-03-05" });
    const excluded = insertTxn({
      amount: -20,
      kind: "expense",
      excluded: true,
      date: "2031-03-06",
    });

    const hidden = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      excluded: "hide",
    });
    expect(hidden).toContain(kept);
    expect(hidden).not.toContain(excluded);

    const only = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      excluded: "only",
    });
    expect(only).toEqual([excluded]);
  });

  it("amount bounds apply to the magnitude, not the sign", () => {
    const small = insertTxn({ amount: -50, kind: "expense", date: "2031-03-10" });
    const large = insertTxn({ amount: -900, kind: "expense", date: "2031-03-11" });
    const bigIncome = insertTxn({
      amount: 800,
      kind: "income",
      date: "2031-03-12",
    });

    const ids = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      amountMin: 100,
      amountMax: 1000,
    });
    expect(ids).toContain(large);
    expect(ids).toContain(bigIncome);
    expect(ids).not.toContain(small);
  });

  it("filters by card/account number", () => {
    const cardA = insertTxn({
      amount: -30,
      kind: "expense",
      date: "2031-03-15",
      accountNumber: "9999",
    });
    const cardB = insertTxn({
      amount: -40,
      kind: "expense",
      date: "2031-03-16",
      accountNumber: "8888",
    });

    const ids = queries.resolveFilteredTransactionIds(WS, {
      ...range,
      accountNumbers: ["9999"],
    });
    expect(ids).toContain(cardA);
    expect(ids).not.toContain(cardB);

    const accounts = queries.listTransactionAccounts(WS);
    expect(accounts.map((a) => a.accountNumber)).toContain("9999");
  });
});

describe("manual transactions", () => {
  it("creates a signed row with user-owned metadata", () => {
    const expenseId = queries.createManualTransaction(WS, {
      date: "2031-06-01",
      amount: 55.5,
      kind: "expense",
      description: "falafel, cash",
      categoryId: expenseCategoryId,
      memo: "lunch",
    });
    const incomeId = queries.createManualTransaction(WS, {
      date: "2031-06-02",
      amount: 200,
      kind: "income",
      description: "sold a chair",
    });

    const expense = db
      .prepare(
        `SELECT provider, account_number, charged_amount, kind, kind_source,
                category_id, category_source, sync_run_id, memo
         FROM transactions WHERE id = ?`
      )
      .get(expenseId) as Record<string, unknown>;
    const income = db
      .prepare(
        `SELECT charged_amount, category_id, category_source, sync_run_id
         FROM transactions WHERE id = ?`
      )
      .get(incomeId) as Record<string, unknown>;

    expect(expense).toMatchObject({
      provider: "manual",
      account_number: "cash",
      charged_amount: -55.5,
      kind: "expense",
      kind_source: "user",
      category_id: expenseCategoryId,
      category_source: "user",
      memo: "lunch",
    });
    expect(income.charged_amount).toBe(200);
    expect(income.category_id).toBeNull();
    expect(income.category_source).toBeNull();
    // Both hang off the same synthetic per-workspace sync run.
    expect(income.sync_run_id).toBe(expense.sync_run_id);
  });

  it("deletes manual rows only", () => {
    const manualId = queries.createManualTransaction(WS, {
      date: "2031-06-03",
      amount: 10,
      kind: "expense",
      description: "bus fare",
    });
    const syncedId = insertTxn({ amount: -10, kind: "expense" });

    expect(queries.deleteManualTransaction(WS, manualId)).toBe(true);
    expect(queries.deleteManualTransaction(WS, syncedId)).toBe(false);
    const gone = db
      .prepare(`SELECT COUNT(*) as count FROM transactions WHERE id = ?`)
      .get(manualId) as { count: number };
    expect(gone.count).toBe(0);
  });
});

describe("getTransactionsSummary", () => {
  it("counts by kind and reports not-counted rows separately", () => {
    const date = "2030-01-10";
    insertTxn({ amount: 1000, kind: "income", date });
    insertTxn({ amount: -400, kind: "expense", date });
    // A refund: positive amount on an expense row reduces spending.
    insertTxn({ amount: 50, kind: "expense", date });
    insertTxn({ amount: -2000, kind: "transfer", date });
    insertTxn({ amount: -100, kind: "expense", excluded: true, date });

    const summary = queries.getTransactionsSummary(
      WS,
      "2030-01-01",
      "2030-01-31"
    );

    expect(summary.income).toMatchObject({ total: 1000, count: 1 });
    expect(summary.expense).toMatchObject({ total: 350, count: 2 });
    expect(summary.net).toBe(650);
    expect(summary.notCounted).toEqual({
      count: 2,
      total: 2100,
      excludedCount: 1,
      transferCount: 1,
    });
  });
});
