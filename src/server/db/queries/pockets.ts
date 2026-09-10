import "server-only";

import { getDb } from "../index";
import type { Pocket, PocketType } from "@/lib/types";

const POCKET_TYPES: PocketType[] = ["cash", "savings", "investment", "loan", "other"];

export function isPocketType(value: unknown): value is PocketType {
  return typeof value === "string" && (POCKET_TYPES as string[]).includes(value);
}

interface PocketRow {
  id: number;
  name: string;
  emoji: string | null;
  color: string;
  type: PocketType;
  planned_monthly: number | null;
  archived_at: string | null;
  created_at: string;
  transaction_count: number;
}

function mapRow(row: PocketRow): Pocket {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    type: row.type,
    plannedMonthly: row.planned_monthly,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    transactionCount: row.transaction_count,
  };
}

const SELECT = `
  SELECT p.id, p.name, p.emoji, p.color, p.type, p.planned_monthly,
         p.archived_at, p.created_at,
         (SELECT COUNT(*) FROM transactions t WHERE t.pocket_id = p.id) AS transaction_count
  FROM pockets p`;

export function listPockets(
  workspaceId: number,
  opts: { includeArchived?: boolean } = {}
): Pocket[] {
  const archived = opts.includeArchived ? "" : "AND p.archived_at IS NULL";
  const rows = getDb()
    .prepare(`${SELECT} WHERE p.workspace_id = ? ${archived} ORDER BY p.archived_at IS NOT NULL, p.id`)
    .all(workspaceId) as PocketRow[];
  return rows.map(mapRow);
}

export function getPocket(workspaceId: number, id: number): Pocket | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE p.workspace_id = ? AND p.id = ?`)
    .get(workspaceId, id) as PocketRow | undefined;
  return row ? mapRow(row) : null;
}

export interface PocketInput {
  name: string;
  emoji?: string | null;
  color: string;
  type: PocketType;
  plannedMonthly?: number | null;
}

export function createPocket(workspaceId: number, input: PocketInput): Pocket {
  const result = getDb()
    .prepare(
      `INSERT INTO pockets (workspace_id, name, emoji, color, type, planned_monthly)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      workspaceId,
      input.name.trim(),
      input.emoji?.trim() || null,
      input.color,
      input.type,
      input.plannedMonthly ?? null
    );
  const pocket = getPocket(workspaceId, Number(result.lastInsertRowid));
  if (!pocket) throw new Error("Pocket creation failed");
  return pocket;
}

export function updatePocket(
  workspaceId: number,
  id: number,
  patch: Partial<PocketInput> & { archived?: boolean }
): Pocket | null {
  const existing = getPocket(workspaceId, id);
  if (!existing) return null;
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const emoji =
    patch.emoji !== undefined ? patch.emoji?.trim() || null : existing.emoji;
  const color = patch.color ?? existing.color;
  const type = patch.type ?? existing.type;
  const plannedMonthly =
    patch.plannedMonthly !== undefined
      ? patch.plannedMonthly
      : existing.plannedMonthly;
  const archivedAt =
    patch.archived === undefined
      ? existing.archivedAt
      : patch.archived
        ? existing.archivedAt ?? new Date().toISOString()
        : null;
  getDb()
    .prepare(
      `UPDATE pockets
       SET name = ?, emoji = ?, color = ?, type = ?, planned_monthly = ?, archived_at = ?
       WHERE workspace_id = ? AND id = ?`
    )
    .run(name, emoji, color, type, plannedMonthly, archivedAt, workspaceId, id);
  return getPocket(workspaceId, id);
}

/**
 * Delete a pocket. Rows that pointed at it lose the pocket (FK SET NULL)
 * but keep kind = transfer, so nothing silently becomes spending again.
 */
export function deletePocket(workspaceId: number, id: number): boolean {
  const result = getDb()
    .prepare(`DELETE FROM pockets WHERE workspace_id = ? AND id = ?`)
    .run(workspaceId, id);
  return result.changes > 0;
}

/** Seed the starter pockets for a brand-new workspace. */
export function seedDefaultPockets(workspaceId: number): void {
  const insert = getDb().prepare(
    `INSERT INTO pockets (workspace_id, name, emoji, color, type) VALUES (?, ?, ?, ?, ?)`
  );
  insert.run(workspaceId, "Cash", "💵", "#DBC27F", "cash");
  insert.run(workspaceId, "Savings", "🏦", "#7DC8B3", "savings");
  insert.run(workspaceId, "Investments", "📈", "#7B85C9", "investment");
}

export interface PocketMovement {
  pocketId: number;
  /** Money that went into the pocket (positive number). */
  moneyIn: number;
  /** Money that came out of the pocket (positive number). */
  moneyOut: number;
  count: number;
}

/** Per-pocket movement over a date range. */
export function getPocketMovements(
  workspaceId: number,
  from: string,
  to: string
): PocketMovement[] {
  return getDb()
    .prepare(
      `SELECT pocket_id AS pocketId,
              COALESCE(SUM(CASE WHEN charged_amount < 0 THEN -charged_amount ELSE 0 END), 0) AS moneyIn,
              COALESCE(SUM(CASE WHEN charged_amount > 0 THEN charged_amount ELSE 0 END), 0) AS moneyOut,
              COUNT(*) AS count
       FROM transactions
       WHERE workspace_id = ? AND pocket_id IS NOT NULL
         AND date >= ? AND date <= ? AND status = 'completed' AND is_excluded = 0
       GROUP BY pocket_id`
    )
    .all(workspaceId, from, to) as PocketMovement[];
}
