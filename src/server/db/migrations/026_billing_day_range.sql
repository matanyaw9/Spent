-- Billing day can be any day of the month, entered as a number. Rebuild
-- to relax the CHECK from 1-28 to 1-31.
CREATE TABLE cards_new (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  nickname TEXT CHECK(nickname IS NULL OR length(nickname) <= 64),
  card_type TEXT CHECK(card_type IN ('credit','debit','prepaid')),
  billing_day INTEGER CHECK(billing_day BETWEEN 1 AND 31),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, account_number)
);
INSERT INTO cards_new SELECT * FROM cards;
DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;
