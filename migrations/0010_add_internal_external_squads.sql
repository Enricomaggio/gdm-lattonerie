ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "is_internal" boolean NOT NULL DEFAULT true;
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "default_capo_id" varchar;
ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "external_worker_counts" jsonb;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'workers_default_capo_id_fkey'
      AND table_name = 'workers'
  ) THEN
    ALTER TABLE "workers"
      ADD CONSTRAINT "workers_default_capo_id_fkey"
      FOREIGN KEY ("default_capo_id") REFERENCES "workers"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
