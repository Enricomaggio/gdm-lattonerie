CREATE TABLE IF NOT EXISTS "warehouse_balances" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" varchar NOT NULL,
  "warehouse_type" text NOT NULL,
  "date" timestamp,
  "value" numeric(12, 2) NOT NULL DEFAULT 0,
  CONSTRAINT "warehouse_balances_company_warehouse_date_unique" UNIQUE NULLS NOT DISTINCT ("company_id", "warehouse_type", "date")
);
CREATE INDEX IF NOT EXISTS "warehouse_balances_company_id_idx" ON "warehouse_balances" ("company_id");
