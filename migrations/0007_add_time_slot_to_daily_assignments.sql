ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "time_slot" text NOT NULL DEFAULT 'FULL_DAY';
