-- Migration: Remove work_type column from opportunities and projects tables
-- The "Tipo Appalto" (Privato/Pubblico) field is no longer tracked at opportunity/project level.
-- The Privato/Pubblico distinction remains at the lead/contact level (entityType/companyNature).

ALTER TABLE "opportunities" DROP COLUMN IF EXISTS "work_type";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "work_type";
