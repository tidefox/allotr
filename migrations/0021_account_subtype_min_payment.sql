-- A free-text label for what kind of account it is ("debit card", "current
-- account"), and a credit (liability) account's minimum payment in the
-- account's currency. Both are shown, never acted on: neither changes a
-- balance or a figure, and a minimum payment creates no bill (docs/domain.md
-- "Credit limit and due day").
ALTER TABLE accounts ADD COLUMN subtype TEXT CHECK (
  subtype IS NULL OR (length(subtype) BETWEEN 1 AND 100 AND subtype = trim(subtype))
);
ALTER TABLE accounts ADD COLUMN min_payment_minor INTEGER CHECK (
  min_payment_minor IS NULL
  OR (min_payment_minor > 0 AND kind = 'liability')
);
