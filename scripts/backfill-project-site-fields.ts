/**
 * One-time migration script: backfill site_city, site_province, site_zip, site_address
 * on existing projects from their linked opportunities.
 *
 * This fixes projects where site_address was stored as a concatenated string
 * (e.g. "Montebelluna (TV) Via Piave") instead of the clean opportunity.site_address
 * (e.g. "Via Piave"), and where site_city/site_province/site_zip were missing.
 *
 * Run with: npx tsx scripts/backfill-project-site-fields.ts
 */

import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // Update city, province, zip from linked opportunity where missing on project
    const result = await pool.query(`
      UPDATE projects p
      SET
        site_city = o.site_city,
        site_province = o.site_province,
        site_zip = o.site_zip,
        site_address = COALESCE(o.site_address, p.site_address)
      FROM opportunities o
      WHERE p.opportunity_id = o.id
        AND (
          p.site_city IS NULL
          OR p.site_province IS NULL
          OR p.site_zip IS NULL
        )
        AND (
          o.site_city IS NOT NULL
          OR o.site_province IS NOT NULL
          OR o.site_zip IS NOT NULL
        )
    `);

    console.log(`Backfill completato: ${result.rowCount} progetti aggiornati con site_city/site_province/site_zip/site_address dall'opportunità collegata.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Errore durante il backfill:", err);
  process.exit(1);
});
