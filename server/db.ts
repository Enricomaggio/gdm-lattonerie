import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function bootstrapDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS clause_overrides (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL REFERENCES companies(id),
        clause_id TEXT NOT NULL,
        text TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'clause_overrides_company_clause_unique'
            AND conrelid = 'clause_overrides'::regclass
        ) THEN
          IF EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'clause_overrides'
              AND indexname = 'clause_overrides_company_clause_unique_idx'
          ) THEN
            ALTER TABLE clause_overrides
              ADD CONSTRAINT clause_overrides_company_clause_unique
              UNIQUE USING INDEX clause_overrides_company_clause_unique_idx;
          ELSE
            ALTER TABLE clause_overrides
              ADD CONSTRAINT clause_overrides_company_clause_unique
              UNIQUE (company_id, clause_id);
          END IF;
        END IF;
      END
      $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS clause_overrides_company_id_idx
        ON clause_overrides (company_id);
    `);

    await client.query(`
      UPDATE opportunities o
      SET won_at = o.updated_at
      FROM pipeline_stages ps
      WHERE o.stage_id = ps.id
        AND ps.name = 'Vinto'
        AND o.won_at IS NULL;
    `);
    await client.query(`
      UPDATE opportunities o
      SET lost_at = o.updated_at
      FROM pipeline_stages ps
      WHERE o.stage_id = ps.id
        AND ps.name = 'Perso'
        AND o.lost_at IS NULL;
    `);

    await client.query(`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS quote_reminder_snoozed_until TIMESTAMP;
    `);

    await client.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS cantiere_status_override TEXT;
    `);

    await client.query(`
      UPDATE opportunities o
      SET quote_sent_at = o.updated_at
      FROM pipeline_stages ps
      WHERE o.stage_id = ps.id
        AND ps.name = 'Preventivo Inviato'
        AND o.quote_sent_at IS NULL;
    `);

    // Migration 0001: team_members table + daily_assignments columns
    await client.query(`
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
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "team_members_team_id_idx" ON "team_members" ("team_id");
      CREATE INDEX IF NOT EXISTS "team_members_company_id_idx" ON "team_members" ("company_id");
    `);
    await client.query(`
      ALTER TABLE "daily_assignments"
        ADD COLUMN IF NOT EXISTS "member_adjustments" jsonb,
        ADD COLUMN IF NOT EXISTS "grid_note" text,
        ADD COLUMN IF NOT EXISTS "delivery_type" text;
    `);

    // Migration 0002: brochure_sent on leads
    await client.query(`
      ALTER TABLE "leads"
        ADD COLUMN IF NOT EXISTS "brochure_sent" boolean DEFAULT false;
    `);

    // Migration 0003: is_automatic on reminders
    await client.query(`
      ALTER TABLE "reminders"
        ADD COLUMN IF NOT EXISTS "is_automatic" boolean NOT NULL DEFAULT false;
    `);

    // Migration 0004: unique constraint on quotes (company_id, number)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'quotes_company_id_number_unique'
            AND conrelid = 'quotes'::regclass
        ) THEN
          BEGIN
            ALTER TABLE quotes
              ADD CONSTRAINT quotes_company_id_number_unique UNIQUE (company_id, number);
          EXCEPTION
            WHEN unique_violation THEN
              NULL;
          END;
        END IF;
      END
      $$;
    `);

    // Migration 0005: sort_order on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
    `);

    // Migration 0006: site_city and site_province on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS site_city TEXT,
        ADD COLUMN IF NOT EXISTS site_province TEXT;
    `);

    // Migration 0007: sort_order on workers
    const sortOrderAdded = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'workers' AND column_name = 'sort_order'
      LIMIT 1;
    `);
    if (sortOrderAdded.rowCount === 0) {
      await client.query(`
        ALTER TABLE workers
          ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
      `);
      // One-time backfill: initialize sort_order for existing workers (capisquadra first, then alphabetical)
      await client.query(`
        WITH ranked AS (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY is_caposquadra DESC, name ASC) - 1 AS rn
          FROM workers
        )
        UPDATE workers w
        SET sort_order = r.rn
        FROM ranked r
        WHERE w.id = r.id;
      `);
    }

    // Migration 0009: SAL (Stato Avanzamento Lavori) tables
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE sal_status AS ENUM ('BOZZA', 'VERIFICATO', 'INVIATO');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sal_periods (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        period VARCHAR(7) NOT NULL,
        status sal_status NOT NULL DEFAULT 'BOZZA',
        notes TEXT,
        is_final_invoice BOOLEAN NOT NULL DEFAULT FALSE,
        sent_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (project_id, period)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sal_voci (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        sal_period_id VARCHAR NOT NULL REFERENCES sal_periods(id) ON DELETE CASCADE,
        company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        description TEXT NOT NULL DEFAULT '',
        quantity NUMERIC NOT NULL DEFAULT 1,
        um VARCHAR(20) NOT NULL DEFAULT 'cad',
        unit_price NUMERIC NOT NULL DEFAULT 0,
        discount_percent NUMERIC NOT NULL DEFAULT 0,
        total NUMERIC NOT NULL DEFAULT 0,
        vat_rate VARCHAR(5) NOT NULL DEFAULT '22',
        phase VARCHAR(50),
        source_quote_item_id VARCHAR,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sal_periods_company_id ON sal_periods(company_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sal_periods_project_id ON sal_periods(project_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sal_periods_period ON sal_periods(period);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sal_voci_sal_period_id ON sal_voci(sal_period_id);
    `);

    // Migration 0011: team_departure_times and team_free_numbers on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS team_departure_times jsonb,
        ADD COLUMN IF NOT EXISTS team_free_numbers jsonb;
    `);

    // Migration 0013: stage_entered_at on projects
    await client.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMP;
    `);

    // Migration 0015: team_notes on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS team_notes jsonb;
    `);

    // Migration 0016: team_note_colors on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS team_note_colors jsonb;
    `);

    // Migration 0018 (grid_note_color): grid_note_color on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS grid_note_color text;
    `);

    // Migration 0018: photo notification scheduling fields on opportunities
    await client.query(`
      ALTER TABLE opportunities
        ADD COLUMN IF NOT EXISTS photo_notification_scheduled_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS photo_notification_sent_at TIMESTAMP;
    `);

    // Migration 0019: Proxit access control — proxitPriority and proxit_presence table
    await client.query(`
      ALTER TABLE user_companies
        ADD COLUMN IF NOT EXISTS proxit_priority INTEGER;
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS proxit_presence (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        session_id VARCHAR NOT NULL,
        last_heartbeat TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS proxit_presence_company_id_idx ON proxit_presence(company_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS proxit_presence_user_id_idx ON proxit_presence(user_id);
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS proxit_presence_session_uniq ON proxit_presence(user_id, company_id, session_id);
    `);

    // Migration 0020: external_team_contacted on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS external_team_contacted jsonb;
    `);

    // Migration 0017: working_days on daily_assignments (days of week as int array)
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}';
    `);

    // Migration 0019: material_type and material_quantity on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS material_type text,
        ADD COLUMN IF NOT EXISTS material_quantity integer;
    `);

    // Migration 0020b: warehouse_balances table (saldi di magazzino per azienda)
    await client.query(`
      CREATE TABLE IF NOT EXISTS warehouse_balances (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        warehouse_type TEXT NOT NULL,
        date TIMESTAMP,
        value NUMERIC(12, 2) NOT NULL DEFAULT 0,
        CONSTRAINT warehouse_balances_company_warehouse_date_unique
          UNIQUE NULLS NOT DISTINCT (company_id, warehouse_type, date)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS warehouse_balances_company_id_idx
        ON warehouse_balances (company_id);
    `);

    // Migration 0021: chi/cosa fields on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS chi text,
        ADD COLUMN IF NOT EXISTS cosa text;
    `);

    // Migration 0022: materials (jsonb) on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS materials jsonb;
    `);

    // Migration 0023: chi_color and cosa_color on daily_assignments
    await client.query(`
      ALTER TABLE daily_assignments
        ADD COLUMN IF NOT EXISTS chi_color text,
        ADD COLUMN IF NOT EXISTS cosa_color text;
    `);

    // Migration 0024: catalog rewrite — raw_materials and products (global, no company_id)
    // (mantenuto per cronistoria — le tabelle vengono droppate dalla migration successiva)

    // Migration 0025: Catalogo Lattoneria — sostituisce raw_materials e products con
    // materials, material_thicknesses, catalog_articles, labor_rates.
    // Drop old catalog tables (products dipende da raw_materials, droppare prima products).
    await client.query(`DROP TABLE IF EXISTS products CASCADE;`);
    await client.query(`DROP TABLE IF EXISTS raw_materials CASCADE;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS materials (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        density NUMERIC(12, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS material_thicknesses (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        material_id VARCHAR NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
        thickness_mm NUMERIC(8, 3) NOT NULL,
        cost_per_kg NUMERIC(12, 4) NOT NULL DEFAULT 0,
        margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS material_thicknesses_material_id_idx ON material_thicknesses (material_id);
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_articles (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        unit_cost NUMERIC(12, 4) NOT NULL DEFAULT 0,
        margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        unit_of_measure TEXT NOT NULL DEFAULT 'pz',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS labor_rates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        cost_per_day NUMERIC(12, 2) NOT NULL DEFAULT 0,
        margin_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Migration 0026: Preventivatore Lattoneria — colonne nuove su quotes/quote_items
    await client.query(`
      ALTER TABLE quotes
        ADD COLUMN IF NOT EXISTS subject TEXT,
        ADD COLUMN IF NOT EXISTS notes TEXT;
    `);
    await client.query(`
      ALTER TABLE quotes
        ALTER COLUMN global_params DROP NOT NULL;
    `);
    await client.query(`
      ALTER TABLE quote_items
        ALTER COLUMN article_id DROP NOT NULL;
    `);
    await client.query(`
      ALTER TABLE quote_items
        ADD COLUMN IF NOT EXISTS type TEXT,
        ADD COLUMN IF NOT EXISTS material_id VARCHAR REFERENCES materials(id),
        ADD COLUMN IF NOT EXISTS material_thickness_id VARCHAR REFERENCES material_thicknesses(id),
        ADD COLUMN IF NOT EXISTS catalog_article_id VARCHAR REFERENCES catalog_articles(id),
        ADD COLUMN IF NOT EXISTS labor_rate_id VARCHAR REFERENCES labor_rates(id),
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS unit_of_measure TEXT,
        ADD COLUMN IF NOT EXISTS development_mm NUMERIC(12, 3),
        ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12, 4),
        ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12, 4),
        ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(6, 2),
        ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS quote_items_type_idx ON quote_items (type);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS quote_items_display_order_idx ON quote_items (display_order);
    `);
  } finally {
    client.release();
  }
}
