import "server-only";

import { getDb } from "../index";
import type { Tag } from "@/lib/types";

interface TagRow {
  id: number;
  name: string;
  color: string;
  created_at: string;
  transaction_count: number;
}

function mapRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    transactionCount: row.transaction_count,
  };
}

const SELECT = `
  SELECT g.id, g.name, g.color, g.created_at,
         (SELECT COUNT(*) FROM transaction_tags tt WHERE tt.tag_id = g.id) AS transaction_count
  FROM tags g`;

export function listTags(workspaceId: number): Tag[] {
  const rows = getDb()
    .prepare(`${SELECT} WHERE g.workspace_id = ? ORDER BY g.name COLLATE NOCASE`)
    .all(workspaceId) as TagRow[];
  return rows.map(mapRow);
}

export function getTag(workspaceId: number, id: number): Tag | null {
  const row = getDb()
    .prepare(`${SELECT} WHERE g.workspace_id = ? AND g.id = ?`)
    .get(workspaceId, id) as TagRow | undefined;
  return row ? mapRow(row) : null;
}

export function createTag(
  workspaceId: number,
  input: { name: string; color: string }
): Tag {
  const result = getDb()
    .prepare(`INSERT INTO tags (workspace_id, name, color) VALUES (?, ?, ?)`)
    .run(workspaceId, input.name.trim(), input.color);
  const tag = getTag(workspaceId, Number(result.lastInsertRowid));
  if (!tag) throw new Error("Tag creation failed");
  return tag;
}

export function updateTag(
  workspaceId: number,
  id: number,
  patch: { name?: string; color?: string }
): Tag | null {
  const existing = getTag(workspaceId, id);
  if (!existing) return null;
  getDb()
    .prepare(`UPDATE tags SET name = ?, color = ? WHERE workspace_id = ? AND id = ?`)
    .run(
      patch.name !== undefined ? patch.name.trim() : existing.name,
      patch.color ?? existing.color,
      workspaceId,
      id
    );
  return getTag(workspaceId, id);
}

export function deleteTag(workspaceId: number, id: number): boolean {
  const result = getDb()
    .prepare(`DELETE FROM tags WHERE workspace_id = ? AND id = ?`)
    .run(workspaceId, id);
  return result.changes > 0;
}

function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Add or remove one tag on many transactions. Rows outside the workspace
 * are ignored. Returns how many rows changed.
 */
export function bulkSetTag(
  workspaceId: number,
  transactionIds: number[],
  tagId: number,
  add: boolean
): number {
  if (transactionIds.length === 0) return 0;
  const db = getDb();
  const tag = getTag(workspaceId, tagId);
  if (!tag) return 0;
  let changed = 0;
  db.transaction(() => {
    for (const ids of chunk(transactionIds)) {
      const placeholders = ids.map(() => "?").join(",");
      const result = add
        ? db
            .prepare(
              `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
               SELECT id, ? FROM transactions
               WHERE workspace_id = ? AND id IN (${placeholders})`
            )
            .run(tagId, workspaceId, ...ids)
        : db
            .prepare(
              `DELETE FROM transaction_tags
               WHERE tag_id = ? AND transaction_id IN (
                 SELECT id FROM transactions WHERE workspace_id = ? AND id IN (${placeholders})
               )`
            )
            .run(tagId, workspaceId, ...ids);
      changed += result.changes;
    }
  })();
  return changed;
}

/** Replace the full tag set of one transaction. */
export function setTransactionTags(
  workspaceId: number,
  transactionId: number,
  tagIds: number[]
): boolean {
  const db = getDb();
  const owned = db
    .prepare(`SELECT 1 FROM transactions WHERE workspace_id = ? AND id = ?`)
    .get(workspaceId, transactionId);
  if (!owned) return false;
  db.transaction(() => {
    db.prepare(`DELETE FROM transaction_tags WHERE transaction_id = ?`).run(transactionId);
    const insert = db.prepare(
      `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
       SELECT ?, id FROM tags WHERE workspace_id = ? AND id = ?`
    );
    for (const tagId of tagIds) insert.run(transactionId, workspaceId, tagId);
  })();
  return true;
}
