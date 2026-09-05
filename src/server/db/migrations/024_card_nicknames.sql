-- Optional per-card nicknames, keyed by the account number the scraper
-- reports. Shown on transactions in place of the provider name.
CREATE TABLE card_nicknames (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK(length(nickname) <= 64),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, account_number)
);
