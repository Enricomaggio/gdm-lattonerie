ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "team_departure_times" jsonb;
ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "team_free_numbers" jsonb;
