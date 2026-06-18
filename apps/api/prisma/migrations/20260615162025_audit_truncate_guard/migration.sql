-- audit_log append-only-г бэхжүүлэх (CLAUDE.md §2.4)
-- Мөр-түвшний trigger TRUNCATE дээр ажилладаггүй тул statement-түвшний TRUNCATE
-- trigger нэмж, аудитын мөрийг бөөнөөр устгах замыг хаана.
DROP TRIGGER IF EXISTS audit_log_block_truncate ON audit_log;
CREATE TRIGGER audit_log_block_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_no_mutation();
