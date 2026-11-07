CREATE INDEX IF NOT EXISTS admin_sessions_last_seen_idx
  ON admin_sessions(last_seen_at);
CREATE INDEX IF NOT EXISTS login_attempts_updated_idx
  ON login_attempts(updated_at);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx
  ON admin_audit(created_at);
CREATE INDEX IF NOT EXISTS admin_audit_resource_idx
  ON admin_audit(resource, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_audit_summary_object_chk'
  ) THEN
    ALTER TABLE admin_audit ADD CONSTRAINT admin_audit_summary_object_chk
      CHECK (jsonb_typeof(summary) = 'object') NOT VALID;
  END IF;
END $$;
ALTER TABLE admin_audit VALIDATE CONSTRAINT admin_audit_summary_object_chk;

COMMENT ON COLUMN admin_audit.session_ref IS
  'HMAC-SHA-256 session reference. Never stores a raw session token.';
COMMENT ON TABLE admin_audit IS
  'Security-relevant admin actions. Retained for 365 days; summaries must never contain secrets or raw tokens.';
