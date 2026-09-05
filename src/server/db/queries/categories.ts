import "server-only";

import { getDb } from "../index";
import type { Category, CategoryKind } from "@/lib/types";
import { CATEGORY_COLOR_PALETTE } from "@/lib/category-palette";

const CATEGORY_COLUMNS =
  "id, parent_id as parentId, name, color, icon, kind, budget_mode as budgetMode, description";

export function getAllCategories(
  workspaceId: number,
  kind?: CategoryKind,
  opts?: { leavesOnly?: boolean }
): Category[] {
  const leavesOnly = opts?.leavesOnly === true;
  const whereParts: string[] = ["workspace_id = ?"];
  const params: unknown[] = [workspaceId];

  if (kind) {
    whereParts.push("kind = ?");
    params.push(kind);
  }
  if (leavesOnly) {
    whereParts.push(
      "id NOT IN (SELECT parent_id FROM categories WHERE parent_id IS NOT NULL)"
    );
  }

  const sql = `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE ${whereParts.join(" AND ")} ORDER BY name`;
  return getDb().prepare(sql).all(...params) as Category[];
}

export function getCategoryById(
  workspaceId: number,
  id: number
): Category | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE workspace_id = ? AND id = ?`
      )
      .get(workspaceId, id) as Category | undefined) ?? null
  );
}

export function getCategoryByName(
  workspaceId: number,
  name: string
): Category | null {
  return (
    (getDb()
      .prepare(
        `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE workspace_id = ? AND name = ? COLLATE NOCASE`
      )
      .get(workspaceId, name) as Category | undefined) ?? null
  );
}

/**
 * Returns the set of category ids that are parents (i.e., appear as
 * parent_id on at least one other category). Used to filter out parents
 * from AI categorization (AI must target leaves only) and to detect
 * whether a row is rendered as a rollup card on the dashboard.
 */
export function getParentIds(workspaceId: number): Set<number> {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT parent_id AS id FROM categories WHERE workspace_id = ? AND parent_id IS NOT NULL"
    )
    .all(workspaceId) as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export interface CategoryTreeNode {
  parent: Category;
  children: Category[];
}

export function getCategoryTree(
  workspaceId: number,
  kind?: CategoryKind
): { tree: CategoryTreeNode[]; orphans: Category[] } {
  const all = getAllCategories(workspaceId, kind);
  const parentIds = getParentIds(workspaceId);

  const tree: CategoryTreeNode[] = [];
  const orphans: Category[] = [];
  const childrenByParent = new Map<number, Category[]>();

  for (const c of all) {
    if (c.parentId != null) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }

  for (const c of all) {
    if (c.parentId != null) continue;
    if (parentIds.has(c.id)) {
      tree.push({ parent: c, children: childrenByParent.get(c.id) ?? [] });
    } else {
      orphans.push(c);
    }
  }

  return { tree, orphans };
}

export function updateCategoryDescription(
  workspaceId: number,
  id: number,
  description: string | null
): boolean {
  const value = description == null ? null : description.trim() || null;
  const result = getDb()
    .prepare(
      "UPDATE categories SET description = ? WHERE workspace_id = ? AND id = ?"
    )
    .run(value, workspaceId, id);
  return result.changes > 0;
}

export function updateCategoryColor(
  workspaceId: number,
  id: number,
  color: string
): boolean {
  const result = getDb()
    .prepare(
      "UPDATE categories SET color = ? WHERE workspace_id = ? AND id = ?"
    )
    .run(color, workspaceId, id);
  return result.changes > 0;
}

export function updateCategoryIcon(
  workspaceId: number,
  id: number,
  icon: string | null
): boolean {
  const result = getDb()
    .prepare(
      "UPDATE categories SET icon = ? WHERE workspace_id = ? AND id = ?"
    )
    .run(icon, workspaceId, id);
  return result.changes > 0;
}

export function updateCategoryBudgetMode(
  workspaceId: number,
  id: number,
  mode: "budgeted" | "tracking"
): boolean {
  const result = getDb()
    .prepare(
      "UPDATE categories SET budget_mode = ? WHERE workspace_id = ? AND id = ?"
    )
    .run(mode, workspaceId, id);
  return result.changes > 0;
}

export function setBudgetModesBulk(
  workspaceId: number,
  budgetedIds: number[]
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "UPDATE categories SET budget_mode = 'tracking' WHERE workspace_id = ? AND kind = 'expense'"
    ).run(workspaceId);
    if (budgetedIds.length === 0) return;
    const placeholders = budgetedIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE categories SET budget_mode = 'budgeted' WHERE workspace_id = ? AND id IN (${placeholders})`
    ).run(workspaceId, ...budgetedIds);
  })();
}

export type SetParentResult =
  | { ok: true; category: Category }
  | {
      ok: false;
      reason:
        | "not-found"
        | "target-not-found"
        | "kind-mismatch"
        | "cycle"
        | "self-parent";
    };

/**
 * Moves a category under a new parent (or to top-level when parentId is null).
 * Enforces the 2-level invariant:
 *  - target parent must itself be top-level (parent_id IS NULL)
 *  - the child being reassigned must not itself have any children
 *  - kinds must match (expense vs income trees stay separate)
 */
export function setCategoryParent(
  workspaceId: number,
  childId: number,
  parentId: number | null
): SetParentResult {
  const db = getDb();
  const child = getCategoryById(workspaceId, childId);
  if (!child) return { ok: false, reason: "not-found" };

  if (parentId != null) {
    if (parentId === childId) return { ok: false, reason: "self-parent" };

    const target = getCategoryById(workspaceId, parentId);
    if (!target) return { ok: false, reason: "target-not-found" };
    if (target.kind !== child.kind) {
      return { ok: false, reason: "kind-mismatch" };
    }

    // Any category may be a parent (grandparents included); the only
    // structural rule is no cycles: the target must not sit anywhere
    // below the child.
    let cursor: Category | null = target;
    const seen = new Set<number>();
    while (cursor?.parentId != null && !seen.has(cursor.parentId)) {
      if (cursor.parentId === childId) {
        return { ok: false, reason: "cycle" };
      }
      seen.add(cursor.parentId);
      cursor = getCategoryById(workspaceId, cursor.parentId);
    }
  }

  db.prepare(
    "UPDATE categories SET parent_id = ? WHERE workspace_id = ? AND id = ?"
  ).run(parentId, workspaceId, childId);

  const updated = getCategoryById(workspaceId, childId);
  return { ok: true, category: updated as Category };
}

/**
 * Creates a new top-level (parent-eligible) category. Color is picked
 * deterministically when not supplied. Throws if a category with the same
 * name already exists in the workspace (UNIQUE constraint).
 */
export function createParentCategory(
  workspaceId: number,
  input: {
    name: string;
    kind: CategoryKind;
    color?: string;
    icon?: string;
    description?: string | null;
  }
): Category {
  const trimmed = input.name.trim();
  const color = input.color ?? pickColor(trimmed.toLowerCase());
  const icon = input.icon ?? "circle-dot";
  const description = input.description?.trim() || null;

  const result = getDb()
    .prepare(
      "INSERT INTO categories (workspace_id, parent_id, name, color, icon, kind, description) VALUES (?, NULL, ?, ?, ?, ?, ?)"
    )
    .run(workspaceId, trimmed, color, icon, input.kind, description);

  return {
    id: Number(result.lastInsertRowid),
    parentId: null,
    name: trimmed,
    color,
    icon,
    kind: input.kind,
    budgetMode: "budgeted",
    description,
  };
}

/**
 * Hard-coded parent assignments for the seeded expense categories. Mirrors
 * migration 017_seed_category_parents.sql so that AI-proposed categories
 * with names matching a known leaf get auto-grouped at creation time. New
 * names (truly novel proposals) stay as orphan leaves; the user can either
 * leave them ungrouped or reassign in Settings.
 */
export const SEEDED_CATEGORY_PARENTS: Record<string, string> = {
  Groceries: "Food",
  Restaurants: "Food",
  "Coffee & Cafes": "Food",
  Transport: "Transportation",
  Travel: "Transportation",
  Shopping: "Lifestyle",
  Entertainment: "Lifestyle",
  "Personal Care": "Lifestyle",
  "Sports & Hobbies": "Lifestyle",
  "Bills & Utilities": "Home & Bills",
  Home: "Home & Bills",
  Insurance: "Home & Bills",
  Subscriptions: "Home & Bills",
  Health: "Health & Family",
  Education: "Health & Family",
  "Kids & Childcare": "Health & Family",
  "Pet Care": "Health & Family",
  "Cash & ATM": "Money Movement",
  Transfers: "Money Movement",
  "Gifts & Donations": "Money Movement",
  "Fees & Taxes": "Money Movement",
};

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const f = (n: number) => {
    const k = (n + hue * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * A child category defaults to its parent's color theme: same hue, with
 * lightness and saturation nudged deterministically by the child's name so
 * siblings stay distinguishable.
 */
export function deriveChildColor(parentHex: string, seed: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(parentHex)) return pickColor(seed);
  const { h, s, l } = hexToHsl(parentHex);
  const n = hashSeed(seed.toLowerCase());
  const lightShift = ((n % 5) - 2) * 0.055;
  const satShift = (((n >> 3) % 3) - 1) * 0.08;
  return hslToHex(
    h,
    Math.min(0.85, Math.max(0.15, s + satShift)),
    Math.min(0.85, Math.max(0.3, l + lightShift))
  );
}

// New categories get a deterministic color via a hash of the name so the
// same proposal always gets the same color. Palette lives in
// src/lib/category-palette.ts, shared with the color picker UI.
function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % CATEGORY_COLOR_PALETTE.length;
  return CATEGORY_COLOR_PALETTE[idx];
}

/**
 * Create a category if it doesn't already exist (case-insensitive).
 * Returns the category record (existing or newly created). When the name
 * appears in SEEDED_CATEGORY_PARENTS, the new row is auto-attached to the
 * matching parent in the same workspace. Otherwise the category is a
 * top-level leaf; the user can reassign later via Settings.
 */
export function ensureCategory(
  workspaceId: number,
  name: string,
  icon = "circle-dot",
  kind: CategoryKind = "expense",
  opts?: { parentId?: number | null }
): Category {
  const trimmed = name.trim();
  const existing = getCategoryByName(workspaceId, trimmed);
  if (existing) return existing;

  let parentId: number | null = null;
  let parentColor: string | null = null;
  if (opts?.parentId != null) {
    const parent = getCategoryById(workspaceId, opts.parentId);
    if (!parent) throw new Error("parent category not found");
    if (parent.kind !== kind) throw new Error("kind-mismatch");
    parentId = parent.id;
    parentColor = parent.color;
  } else {
    const parentName = SEEDED_CATEGORY_PARENTS[trimmed];
    if (parentName) {
      const parent = getCategoryByName(workspaceId, parentName);
      if (parent && parent.parentId === null) {
        parentId = parent.id;
        parentColor = parent.color;
      }
    }
  }

  const color = parentColor
    ? deriveChildColor(parentColor, trimmed)
    : pickColor(trimmed.toLowerCase());
  const result = getDb()
    .prepare(
      "INSERT INTO categories (workspace_id, parent_id, name, color, icon, kind) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(workspaceId, parentId, trimmed, color, icon, kind);

  return {
    id: Number(result.lastInsertRowid),
    parentId,
    name: trimmed,
    color,
    icon,
    kind,
    budgetMode: "budgeted",
    description: null,
  };
}

export interface CategoryChildRef {
  id: number;
  name: string;
}

export function listCategoryChildren(
  workspaceId: number,
  parentId: number
): CategoryChildRef[] {
  return getDb()
    .prepare(
      `SELECT id, name FROM categories
       WHERE workspace_id = ? AND parent_id = ?
       ORDER BY name COLLATE NOCASE`
    )
    .all(workspaceId, parentId) as CategoryChildRef[];
}

export type DeleteCategoryResult =
  | { ok: true; deletedCategoryId: number; unassignedTransactionCount: number }
  | {
      ok: false;
      reason: "not-found" | "has-children";
      children?: CategoryChildRef[];
    };

export function deleteCategory(
  workspaceId: number,
  categoryId: number
): DeleteCategoryResult {
  const db = getDb();
  const category = getCategoryById(workspaceId, categoryId);
  if (!category) {
    return { ok: false, reason: "not-found" };
  }

  const children = listCategoryChildren(workspaceId, categoryId);
  if (children.length > 0) {
    return { ok: false, reason: "has-children", children };
  }

  const txnCountRow = db
    .prepare(
      "SELECT COUNT(*) as count FROM transactions WHERE workspace_id = ? AND category_id = ?"
    )
    .get(workspaceId, categoryId) as { count: number };

  const run = db.transaction(() => {
    db.prepare(
      `UPDATE transactions
       SET category_id = NULL, category_source = NULL, updated_at = datetime('now')
       WHERE workspace_id = ? AND category_id = ?`
    ).run(workspaceId, categoryId);

    db.prepare("DELETE FROM budgets WHERE category_id = ?").run(categoryId);
    db.prepare(
      "DELETE FROM merchant_categories WHERE workspace_id = ? AND category_id = ?"
    ).run(workspaceId, categoryId);

    db.prepare(
      "DELETE FROM categories WHERE workspace_id = ? AND id = ?"
    ).run(workspaceId, categoryId);
  });

  run();

  return {
    ok: true,
    deletedCategoryId: categoryId,
    unassignedTransactionCount: txnCountRow.count,
  };
}
