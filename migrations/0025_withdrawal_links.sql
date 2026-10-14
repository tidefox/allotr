-- Withdrawal links (ADR 0038): part of a savings withdrawal tied to the
-- expense it paid for. A link is a setting on two entries, like a bill
-- payment mark or a cover override: it never changes their postings, and
-- the budget reads the two entries as if the expense had been paid straight
-- from the savings account (core, `budgetView`).
--
-- Removing a link, or dropping it because an edit replaced one of its
-- entries, sets `removed_at` instead of deleting the row, so the history of
-- who linked what and when stays. Only rows with no `removed_at` count.
-- Whether an active link still fits (the entries' sides, the amounts left)
-- is core's to say when it reads them, not a constraint here.
CREATE TABLE withdrawal_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  withdrawal_id TEXT NOT NULL,
  expense_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  created_at TEXT NOT NULL,
  removed_at TEXT,
  CHECK (withdrawal_id <> expense_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (withdrawal_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (expense_id, user_id) REFERENCES transactions (id, user_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX withdrawal_links_user_id_idx ON withdrawal_links (user_id);
CREATE INDEX withdrawal_links_withdrawal_id_idx
  ON withdrawal_links (withdrawal_id);
CREATE INDEX withdrawal_links_expense_id_idx ON withdrawal_links (expense_id);
