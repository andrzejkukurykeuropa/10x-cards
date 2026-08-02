DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fsrs_state') THEN
    CREATE TYPE fsrs_state AS ENUM ('New', 'Learning', 'Review', 'Relearning');
  END IF;
END$$;

ALTER TABLE flashcards
  DROP COLUMN IF EXISTS easiness_factor,
  DROP COLUMN IF EXISTS interval,
  ADD COLUMN IF NOT EXISTS stability      double precision NOT NULL DEFAULT 0 CHECK (stability >= 0),
  ADD COLUMN IF NOT EXISTS difficulty     double precision NOT NULL DEFAULT 0 CHECK (difficulty >= 0 AND difficulty <= 10),
  ADD COLUMN IF NOT EXISTS state          fsrs_state NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS lapses         integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  ADD COLUMN IF NOT EXISTS last_review    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS scheduled_days integer NOT NULL DEFAULT 0;

-- Reset existing rows to a fresh FSRS state (no SM-2 review history worth preserving in MVP)
UPDATE flashcards
SET repetitions = 0,
    due_date = now();
