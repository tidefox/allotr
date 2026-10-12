-- What an income category is: earnings (`earned`, `passive`) or another
-- inflow (`gift`, `refund`). Reports and the savings rate count earnings as a
-- cycle's income and show the rest apart; balances, net worth and the daily
-- number do not read it (money is money). Only an income category can be
-- anything but `earned`, and a paycheck category is always `earned`.
ALTER TABLE categories ADD COLUMN income_class TEXT NOT NULL DEFAULT 'earned'
  CHECK (income_class IN ('earned', 'passive', 'gift', 'refund'))
  CHECK (income_class = 'earned' OR (kind = 'income' AND is_paycheck = 0));

ALTER TABLE starter_categories ADD COLUMN income_class TEXT NOT NULL
  DEFAULT 'earned'
  CHECK (income_class IN ('earned', 'passive', 'gift', 'refund'));

UPDATE starter_categories SET income_class = 'passive' WHERE name = 'Interest';
UPDATE starter_categories SET income_class = 'refund' WHERE name = 'Tax refund';

-- Users from before this migration: the starter names keep their meaning.
-- A category the user renamed or made themselves stays `earned`.
UPDATE categories SET income_class = 'passive'
WHERE kind = 'income' AND parent_id IS NULL AND is_paycheck = 0
  AND lower(name) = 'interest';
UPDATE categories SET income_class = 'refund'
WHERE kind = 'income' AND parent_id IS NULL AND is_paycheck = 0
  AND lower(name) = 'tax refund';

-- A starter category for gifts. New users get it through the starter table
-- and its trigger; users from before this migration get it here, unless they
-- already have a top-level category of that name.
INSERT INTO starter_categories
  (name, parent_name, kind, is_paycheck, position, income_class)
VALUES ('Gifts', NULL, 'income', 0, 5, 'gift');

INSERT INTO categories
  (id, user_id, name, kind, parent_id, is_paycheck, position, income_class,
   created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, 'Gifts', 'income', NULL, 0, 5, 'gift',
       u.created_at, u.created_at
FROM users AS u
WHERE NOT EXISTS (
  SELECT 1 FROM categories AS c
  WHERE c.user_id = u.id
    AND c.parent_id IS NULL
    AND c.merged_into_id IS NULL
    AND lower(c.name) = 'gifts'
);

DROP TRIGGER users_seed_categories;
CREATE TRIGGER users_seed_categories
AFTER INSERT ON users
BEGIN
  INSERT INTO categories
    (id, user_id, name, kind, parent_id, is_paycheck, income_class, position,
     colour, icon, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.id, name, kind, NULL, is_paycheck,
         income_class, position, colour, icon, NEW.created_at, NEW.created_at
  FROM starter_categories WHERE parent_name IS NULL;

  INSERT INTO categories
    (id, user_id, name, kind, parent_id, is_paycheck, income_class, position,
     colour, icon, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.id, s.name, s.kind, p.id,
         s.is_paycheck, s.income_class, s.position, s.colour, s.icon,
         NEW.created_at, NEW.created_at
  FROM starter_categories AS s
  JOIN categories AS p
    ON p.user_id = NEW.id AND p.parent_id IS NULL AND p.name = s.parent_name;
END;
