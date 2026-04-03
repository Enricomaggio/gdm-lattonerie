ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "end_day_time_slot" text NOT NULL DEFAULT 'FULL_DAY';
