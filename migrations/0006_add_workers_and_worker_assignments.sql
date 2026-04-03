CREATE TABLE IF NOT EXISTS "workers" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "is_caposquadra" boolean DEFAULT false NOT NULL,
  "color" text DEFAULT '#4563FF' NOT NULL,
  "company_id" varchar NOT NULL REFERENCES "companies"("id"),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workers_company_id_idx" ON "workers" ("company_id");

ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "worker_assignments" jsonb DEFAULT '{}'::jsonb;
