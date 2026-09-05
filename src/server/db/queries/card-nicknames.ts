import "server-only";

import { getDb } from "../index";

/** Set, replace, or clear (null/empty) the nickname for one card/account. */
export function setCardNickname(
  workspaceId: number,
  accountNumber: string,
  nickname: string | null
): void {
  const db = getDb();
  const trimmed = nickname?.trim() || null;
  if (trimmed == null) {
    db.prepare(
      `DELETE FROM card_nicknames WHERE workspace_id = ? AND account_number = ?`
    ).run(workspaceId, accountNumber);
    return;
  }
  db.prepare(
    `INSERT INTO card_nicknames (workspace_id, account_number, nickname)
     VALUES (?, ?, ?)
     ON CONFLICT(workspace_id, account_number)
     DO UPDATE SET nickname = excluded.nickname`
  ).run(workspaceId, accountNumber, trimmed);
}
