ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "working_days" integer[] NOT NULL DEFAULT '{1,2,3,4,5}';
