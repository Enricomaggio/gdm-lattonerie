-- Migration: Add brochure_sent to leads table
-- This migration adds the brochureSent boolean field to track if a brochure was sent to a contact.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "brochure_sent" boolean DEFAULT false;
