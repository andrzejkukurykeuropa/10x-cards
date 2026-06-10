-- Funkcja triggera (idempotentna — CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela
CREATE TABLE IF NOT EXISTS flashcards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indeks na user_id (przyspieszenie zapytań filtrowanych przez RLS)
CREATE INDEX IF NOT EXISTS flashcards_user_id_idx ON flashcards(user_id);

-- Trigger updated_at
CREATE TRIGGER set_flashcards_updated_at
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flashcards"
  ON flashcards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flashcards"
  ON flashcards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flashcards"
  ON flashcards FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own flashcards"
  ON flashcards FOR DELETE
  USING (auth.uid() = user_id);
