CREATE TABLE IF NOT EXISTS "external_engineers" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL REFERENCES "companies"("id"),
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "external_engineers_company_id_idx" ON "external_engineers" ("company_id");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "external_engineer_id" varchar REFERENCES "external_engineers"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "projects_external_engineer_id_idx" ON "projects" ("external_engineer_id");
