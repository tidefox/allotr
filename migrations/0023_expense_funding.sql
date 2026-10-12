-- Whose money paid for an expense: the user's own (`own`) or money that was
-- never theirs to budget, such as a gift spent on a purchase (`outside`).
-- Reports leave an outside expense out of a cycle's spending, pace and
-- calendar heat; balances, net worth, category totals and the daily number do
-- not read it. Only an expense entry can be outside: an undo (a reversal)
-- stays `own` and core follows it to the entry it undoes. A new column
-- rather than a rebuild of `transactions`, which would cascade away every
-- posting; the append-only triggers still hold.
ALTER TABLE transactions ADD COLUMN funding TEXT NOT NULL DEFAULT 'own'
  CHECK (funding IN ('own', 'outside'))
  CHECK (funding = 'own' OR kind = 'expense');
