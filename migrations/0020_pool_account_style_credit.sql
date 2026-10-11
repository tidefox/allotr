-- How a pool and an account look: the same colour (a chart series role of
-- the active theme, never a hex value) and icon key as a category's
-- (0010_category_style.sql). Null means "follow the default": the pool's
-- place among the open pools, and for an account its pool's colour. Nothing
-- here changes any figure.
ALTER TABLE pools ADD COLUMN colour TEXT CHECK (
  colour IS NULL OR colour IN (
    'series-1', 'series-2', 'series-3', 'series-4',
    'series-5', 'series-6', 'series-7', 'series-8'
  )
);
ALTER TABLE pools ADD COLUMN icon TEXT CHECK (
  icon IS NULL OR (icon GLOB '[a-z]*' AND length(icon) <= 40)
);
ALTER TABLE accounts ADD COLUMN colour TEXT CHECK (
  colour IS NULL OR colour IN (
    'series-1', 'series-2', 'series-3', 'series-4',
    'series-5', 'series-6', 'series-7', 'series-8'
  )
);
ALTER TABLE accounts ADD COLUMN icon TEXT CHECK (
  icon IS NULL OR (icon GLOB '[a-z]*' AND length(icon) <= 40)
);

-- A credit (liability) account's limit, in the account's currency, and the
-- day of the month its payment is due. Both are shown, never acted on: a due
-- day creates no bill (docs/domain.md "Credit limit and due day").
ALTER TABLE accounts ADD COLUMN credit_limit_minor INTEGER CHECK (
  credit_limit_minor IS NULL
  OR (credit_limit_minor > 0 AND kind = 'liability')
);
ALTER TABLE accounts ADD COLUMN due_day INTEGER CHECK (
  due_day IS NULL OR (due_day BETWEEN 1 AND 31 AND kind = 'liability')
);
