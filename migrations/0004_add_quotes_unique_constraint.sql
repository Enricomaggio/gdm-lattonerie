-- Add unique constraint on (company_id, number) to prevent duplicate quote numbers per company
ALTER TABLE quotes ADD CONSTRAINT quotes_company_id_number_unique UNIQUE (company_id, number);
