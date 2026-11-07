CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_data_object_chk'
  ) THEN
    ALTER TABLE projects ADD CONSTRAINT projects_data_object_chk
      CHECK (jsonb_typeof(data) = 'object') NOT VALID;
  END IF;
END $$;
ALTER TABLE projects VALIDATE CONSTRAINT projects_data_object_chk;
CREATE INDEX IF NOT EXISTS projects_sort_idx ON projects(sort_order,id);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_blocked_idx ON login_attempts(blocked_until);

CREATE TABLE IF NOT EXISTS project_collection (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
INSERT INTO project_collection(id,version,updated_at) VALUES(1,1,now())
  ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_audit (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL,
  session_ref TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary JSONB NOT NULL
);
