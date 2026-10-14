-- Every user has one ledger, and a ledger has an id that never changes
-- (ADR 0034). Seeded rows and system accounts take their ids from it, so two
-- devices that seed the same ledger on their own produce the same rows.
--
-- SQLite cannot add a NOT NULL column without a default, nor a UNIQUE one in
-- the same step, so the column defaults to '' (the sign-up code always sets
-- it) and a unique index makes a second '' fail loudly.
ALTER TABLE users ADD COLUMN ledger_id TEXT NOT NULL DEFAULT '';

-- A random v4-shaped UUID per existing user: version nibble 4, variant 8-b.
-- Two steps, because a subquery that does not use the row is evaluated once.
UPDATE users SET ledger_id = lower(hex(randomblob(16)));
UPDATE users SET ledger_id =
  substr(ledger_id, 1, 8) || '-' || substr(ledger_id, 9, 4) || '-4'
  || substr(ledger_id, 14, 3) || '-'
  || substr('89ab', 1 + (unicode(substr(ledger_id, 17, 1)) % 4), 1)
  || substr(ledger_id, 18, 3) || '-' || substr(ledger_id, 21, 12);

CREATE UNIQUE INDEX users_ledger_id_idx ON users (ledger_id);

-- Seeding moves to code (`seedLedger` in packages/store), which runs right
-- after the user is created and gives every row a deterministic id.
-- Rows seeded by these triggers keep their ids.
DROP TRIGGER users_seed_categories;
DROP TRIGGER users_seed_pools;
DROP TRIGGER users_seed_buffer;

-- The starter set now lives in code too; nothing reads this table any more.
DROP TABLE starter_categories;
