ALTER TABLE flashcards
  ADD COLUMN IF NOT EXISTS due_date          timestamptz        NULL,
  ADD COLUMN IF NOT EXISTS easiness_factor   NUMERIC(4,2)  NOT NULL DEFAULT 2.50,
  ADD COLUMN IF NOT EXISTS interval          integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repetitions       integer       NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS flashcards_due_date_idx ON flashcards (due_date);
