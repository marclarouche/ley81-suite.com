-- Licence records. The PRIVATE signing key is never stored here: licences are
-- signed offline on Marc's Mac (tools/ley81-sign.mjs) and the signed .lic is
-- uploaded back, where the server verifies it with the PUBLIC key only.
--
-- One record per licence = one machine (the licence payload carries a single
-- fingerprint). A customer with N machines has N records. A renewal is a new
-- record that points at the one it renews.
CREATE TABLE licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('consultant', 'company')),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  expires_at TEXT NOT NULL,
  -- requested: entered, waiting for the offline signature
  -- issued:    signed .lic uploaded and verified
  -- superseded: replaced by a renewal that was issued
  -- revoked:   record-only (an offline licence cannot be recalled)
  status TEXT NOT NULL CHECK (status IN ('requested', 'issued', 'superseded', 'revoked')),
  lic_text TEXT,
  issued_at TEXT,
  delivered_at TEXT,
  renews_license_id TEXT,
  note TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_licenses_fingerprint ON licenses (fingerprint);
CREATE INDEX idx_licenses_status ON licenses (status);

-- Every admin action, append-only by convention (the app code only inserts).
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT
);
