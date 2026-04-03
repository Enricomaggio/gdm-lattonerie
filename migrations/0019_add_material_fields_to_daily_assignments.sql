ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "material_type" text;
ALTER TABLE "daily_assignments" ADD COLUMN IF NOT EXISTS "material_quantity" integer;
