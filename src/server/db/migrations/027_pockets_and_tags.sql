-- Pockets: named places the user's own money sits (cash, savings,
-- investments, a loan balance). Moving money into or out of a pocket is
-- neither spending nor income. A transaction with a pocket_id is a
-- movement into (amount < 0) or out of (amount > 0) that pocket; its kind
-- is always 'transfer' so every existing total already leaves it out.
CREATE TABLE pockets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  emoji TEXT,
  color TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('cash','savings','investment','loan','other')),
  -- Expected movement per month (a standing order to savings, a loan
  -- repayment). Lets the dashboard say "extra" or "short" vs plan.
  planned_monthly REAL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);
CREATE INDEX idx_pockets_workspace ON pockets(workspace_id);

ALTER TABLE transactions
  ADD COLUMN pocket_id INTEGER REFERENCES pockets(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_pocket ON transactions(pocket_id);

-- Every workspace starts with the three pockets nearly everyone has.
INSERT INTO pockets (workspace_id, name, emoji, color, type)
SELECT id, 'Cash', '💵', '#DBC27F', 'cash' FROM workspaces;
INSERT INTO pockets (workspace_id, name, emoji, color, type)
SELECT id, 'Savings', '🏦', '#7DC8B3', 'savings' FROM workspaces;
INSERT INTO pockets (workspace_id, name, emoji, color, type)
SELECT id, 'Investments', '📈', '#7B85C9', 'investment' FROM workspaces;

-- Tags: flat, user-named, many-to-many labels that cut across categories
-- ("Trip to Berlin", "Reimbursable"). They never affect totals.
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 40),
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, name)
);
CREATE INDEX idx_tags_workspace ON tags(workspace_id);

CREATE TABLE transaction_tags (
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, tag_id)
);
CREATE INDEX idx_transaction_tags_tag ON transaction_tags(tag_id);
