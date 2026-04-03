-- Migration: Add team_members table and member_adjustments to daily_assignments
-- This migration adds incremental schema changes for the Proxit team members feature.

CREATE TABLE IF NOT EXISTS "team_members" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "team_id" varchar NOT NULL,
        "company_id" varchar NOT NULL,
        "name" text NOT NULL,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "team_members_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action,
        CONSTRAINT "team_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action
);

ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "member_adjustments" jsonb;
ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "grid_note" text;
ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "delivery_type" text;

CREATE INDEX IF NOT EXISTS "team_members_team_id_idx" ON "team_members" ("team_id");
CREATE INDEX IF NOT EXISTS "team_members_company_id_idx" ON "team_members" ("company_id");
