import "server-only";

import { getDb } from "../index";

export interface CardSettingsInput {
  nickname?: string | null;
  cardType?: "credit" | "debit" | "prepaid" | null;
  billingDay?: number | null;
}

/**
 * Merge the given fields into a card's settings row (created on first
 * write). Fields left undefined keep their stored value; explicit null
 * clears one. A row that ends up all-null is removed.
 */
export function updateCardSettings(
  workspaceId: number,
  accountNumber: string,
  input: CardSettingsInput
): void {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT nickname, card_type as cardType, billing_day as billingDay
       FROM cards WHERE workspace_id = ? AND account_number = ?`
    )
    .get(workspaceId, accountNumber) as
    | { nickname: string | null; cardType: string | null; billingDay: number | null }
    | undefined;

  const nickname =
    input.nickname !== undefined
      ? input.nickname?.trim() || null
      : existing?.nickname ?? null;
  const cardType =
    input.cardType !== undefined ? input.cardType : existing?.cardType ?? null;
  const billingDay =
    input.billingDay !== undefined
      ? input.billingDay
      : existing?.billingDay ?? null;

  if (nickname == null && cardType == null && billingDay == null) {
    db.prepare(
      `DELETE FROM cards WHERE workspace_id = ? AND account_number = ?`
    ).run(workspaceId, accountNumber);
    return;
  }

  db.prepare(
    `INSERT INTO cards (workspace_id, account_number, nickname, card_type, billing_day)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, account_number)
     DO UPDATE SET nickname = excluded.nickname,
                   card_type = excluded.card_type,
                   billing_day = excluded.billing_day`
  ).run(workspaceId, accountNumber, nickname, cardType, billingDay);
}
