/*
  # Add load_type to exercises

  Distinguishes how an exercise is loaded:
    - 'weighted'    (default) external weight, e.g. bench press
    - 'bodyweight'  reps only, no weight, e.g. push-ups
    - 'weighted_bw' bodyweight plus added weight, e.g. weighted pull-ups
       (the `weight` column stores the ADDED weight in this case)

  Additive and backward-compatible: existing rows default to 'weighted'.
*/

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS load_type text NOT NULL DEFAULT 'weighted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_load_type_check'
  ) THEN
    ALTER TABLE exercises
      ADD CONSTRAINT exercises_load_type_check
      CHECK (load_type IN ('weighted', 'bodyweight', 'weighted_bw'));
  END IF;
END $$;
