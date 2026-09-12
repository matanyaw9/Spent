-- Card metadata grows beyond nicknames: card type (credit / debit /
-- prepaid) and the billing day for credit cards. Rebuild the nicknames
-- table as `cards` with nickname now optional, keeping existing rows.
CREATE TABLE cards (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  nickname TEXT CHECK(nickname IS NULL OR length(nickname) <= 64),
  card_type TEXT CHECK(card_type IN ('credit','debit','prepaid')),
  billing_day INTEGER CHECK(billing_day BETWEEN 1 AND 28),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, account_number)
);

INSERT INTO cards (workspace_id, account_number, nickname, created_at)
SELECT workspace_id, account_number, nickname, created_at FROM card_nicknames;

DROP TABLE card_nicknames;
