-- The event log (ADR 0032, ADR 0033): every append-only fact is also written
-- here as an event, in the same database transaction as its rows, so the
-- fact tables can be rebuilt by folding the log (`foldFacts` in
-- packages/core). Events carry the full fact, postings included.
--
-- ledger_id is users.ledger_id (ADR 0034). In server mode one process writes
-- a ledger, so `author` is the server's id and `seq` is the next number after
-- the largest one stored, taken inside the writing transaction. The unique
-- (ledger_id, author, seq) key makes a gap or a repeat fail loudly instead.
-- `hlc` text sorts in clock order, so the index below serves both the next
-- clock reading and the fold. `enc` is reserved (ADR 0036) and always NULL.
--
-- Like the fact tables, events never change; rows go only when their user
-- is deleted. Entries written before this migration have no events yet.
CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ledger_id TEXT NOT NULL,
  author TEXT NOT NULL,
  seq INTEGER NOT NULL CHECK (seq >= 1),
  hlc TEXT NOT NULL,
  schema INTEGER NOT NULL CHECK (schema >= 1),
  enc TEXT CHECK (enc IS NULL),
  type TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  UNIQUE (ledger_id, author, seq)
) STRICT;

CREATE INDEX events_ledger_hlc_idx ON events (ledger_id, hlc, author, seq);
CREATE INDEX events_user_id_idx ON events (user_id);

CREATE TRIGGER events_no_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TRIGGER events_no_delete
BEFORE DELETE ON events
WHEN EXISTS (SELECT 1 FROM users WHERE id = OLD.user_id)
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
