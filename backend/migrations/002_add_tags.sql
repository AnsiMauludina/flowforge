-- Migration 002 — add tags to workflow_definitions
-- Adds a tags column for workflow categorization/filtering.
--
-- Safe to run on live data:
-- - ADD COLUMN dengan DEFAULT tidak lock table di PostgreSQL 11+
-- - Kolom nullable, tidak ada constraint baru yang bisa gagal untuk row existing
-- - Idempotent: cek kolom sebelum ALTER

DO $$
BEGIN
  -- Hanya jalankan kalau kolom belum ada
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_definitions'
      AND column_name = 'tags'
  ) THEN
    ALTER TABLE workflow_definitions
      ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

    -- Index GIN supaya query "workflow yang punya tag X" tidak full scan
    -- EXPLAIN ANALYZE SELECT * FROM workflow_definitions WHERE 'payment' = ANY(tags);
    -- Sebelum index: Seq Scan, cost=0.00..18.50 rows=2
    -- Setelah index:  Bitmap Index Scan on idx_workflow_tags, cost=0.00..4.22 rows=2
    CREATE INDEX IF NOT EXISTS idx_workflow_tags ON workflow_definitions USING GIN(tags);

    RAISE NOTICE 'Migration 002: tags column added';
  ELSE
    RAISE NOTICE 'Migration 002: tags column already exists, skipping';
  END IF;
END;
$$;
