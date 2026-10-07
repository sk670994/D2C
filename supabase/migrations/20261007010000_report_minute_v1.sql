-- Report time to the minute (the picker offers 15-minute steps). Safe to re-run.
ALTER TABLE public.report_preferences
  ADD COLUMN IF NOT EXISTS minute SMALLINT NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59);
