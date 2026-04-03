-- Migration: add sort_order to daily_assignments
-- Adds sortOrder field and backfills existing rows using createdAt order per (company_id, day)

ALTER TABLE daily_assignments
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, date::date
      ORDER BY created_at ASC, id ASC
    ) - 1 AS new_sort_order
  FROM daily_assignments
)
UPDATE daily_assignments
SET sort_order = ranked.new_sort_order
FROM ranked
WHERE daily_assignments.id = ranked.id;
