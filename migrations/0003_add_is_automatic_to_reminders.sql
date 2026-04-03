-- Migration: Add is_automatic column to reminders table
-- This migration adds the isAutomatic flag to distinguish manual vs automatic reminders.

ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "is_automatic" boolean NOT NULL DEFAULT false;
