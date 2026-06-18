-- Fuel Retail System — DB hardening (CLAUDE.md §2.4, §8, §6 TimescaleDB)

-- 1) audit_log нь APPEND-ONLY — UPDATE/DELETE-ийг DB түвшинд хорино (§2.4)
CREATE OR REPLACE FUNCTION audit_log_no_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log нь append-only тул % үйлдэл хийх боломжгүй', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_block_mutation ON audit_log;
CREATE TRIGGER audit_log_block_mutation
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_no_mutation();

-- 2) employee_role: компани-түвшний (station_id IS NULL) role давхцлыг хорих
--    (Postgres-д NULL != NULL тул энгийн unique хүрэлцэхгүй — partial index)
CREATE UNIQUE INDEX IF NOT EXISTS employee_role_company_wide_unique
  ON "employee_role" ("employee_id", "role_id")
  WHERE "station_id" IS NULL;

-- 3) tank_reading -> TimescaleDB hypertable (time-series түвшний бичлэг — §6)
--    timescaledb extension байгаа үед л хөрвүүлнэ (энгийн PG дээр алгасна)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
    PERFORM create_hypertable('tank_reading', 'recorded_at',
      if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
END $$;
