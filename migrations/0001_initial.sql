CREATE TABLE conversion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_fingerprint TEXT NOT NULL,
  source_hostname TEXT,
  target TEXT NOT NULL,
  client_family TEXT,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  cache_hit INTEGER NOT NULL DEFAULT 0 CHECK (cache_hit IN (0, 1)),
  node_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX conversion_events_created_idx ON conversion_events(created_at DESC);
CREATE INDEX conversion_events_fingerprint_idx ON conversion_events(source_fingerprint);

CREATE TABLE short_links (
  id TEXT PRIMARY KEY,
  encrypted_target TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  target_fingerprint TEXT NOT NULL,
  output_target TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_accessed_at TEXT,
  UNIQUE(target_fingerprint, output_target)
);

CREATE INDEX short_links_created_idx ON short_links(created_at DESC);

CREATE TABLE blocked_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_fingerprint TEXT NOT NULL UNIQUE,
  hostname TEXT,
  reason TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX admin_audit_created_idx ON admin_audit_log(created_at DESC);
