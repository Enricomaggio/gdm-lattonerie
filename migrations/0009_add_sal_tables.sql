-- Migration 0009: SAL (Stato Avanzamento Lavori) tables

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sal_status') THEN
    CREATE TYPE sal_status AS ENUM ('BOZZA', 'VERIFICATO', 'INVIATO');
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_sal_periods_company_id ON sal_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_sal_periods_project_id ON sal_periods(project_id);
CREATE INDEX IF NOT EXISTS idx_sal_periods_period ON sal_periods(period);
CREATE INDEX IF NOT EXISTS idx_sal_voci_sal_period_id ON sal_voci(sal_period_id);
