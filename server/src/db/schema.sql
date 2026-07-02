-- Gara local database schema (SQLite port of the original Supabase Postgres schema).
--
-- Differences from Postgres, all intentional for offline/local use:
--   * uuid  -> TEXT (uuids are generated in the app layer with crypto.randomUUID)
--   * timestamptz -> TEXT storing ISO-8601 strings (UTC)
--   * boolean -> INTEGER (0/1)
--   * gen_random_uuid()/now() defaults are applied in the service layer.
--
-- ACCESS CONTROL NOTE (mirrors the original RLS decision):
--   The original used Supabase with permissive RLS (USING true) because auth was
--   custom, and enforced all access control in the service layer scoped to the
--   session user id. SQLite has no RLS at all, so ALL access control is likewise
--   enforced in the backend service layer, scoped to the authenticated session
--   user id. This is intentional, not an oversight.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id                TEXT PRIMARY KEY,
  phone_number      TEXT UNIQUE,
  email             TEXT UNIQUE,
  full_name         TEXT,
  is_doctor         INTEGER NOT NULL DEFAULT 0,
  role              TEXT DEFAULT 'patient',
  clinic_name       TEXT,
  password_hash     TEXT NOT NULL,
  password_salt     TEXT NOT NULL,
  session_token     TEXT,
  reset_otp         TEXT,
  reset_otp_expiry  TEXT,
  consultation_fee  INTEGER,
  momo_number       TEXT,
  avatar_url        TEXT,
  allergies         TEXT,
  chronic_conditions TEXT,
  ai_consent        INTEGER DEFAULT 0,
  consented_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS consultations (
  id                  TEXT PRIMARY KEY,
  patient_id          TEXT REFERENCES profiles(id),
  doctor_id           TEXT REFERENCES profiles(id),
  status              TEXT NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment','in_process','complete')),
  biological_sex      TEXT,
  severity            TEXT,
  duration            TEXT,
  symptom_category    TEXT,
  symptom_description TEXT,
  ai_brief_summary    TEXT,
  ai_suggestions      TEXT,
  language            TEXT DEFAULT 'en',
  consultation_fee    INTEGER,
  momo_transaction_id TEXT,
  payment_amount      INTEGER,
  payment_provider    TEXT,
  urgency             TEXT DEFAULT 'low',
  urgency_score       INTEGER DEFAULT 0,
  paid                INTEGER DEFAULT 0,
  closed_at           TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES consultations(id),
  sender_id       TEXT REFERENCES profiles(id),
  message_type    TEXT NOT NULL DEFAULT 'text'
                    CHECK (message_type IN ('text','photo','voice')),
  content         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS clinical_documents (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES consultations(id),
  patient_id      TEXT REFERENCES profiles(id),
  document_kind   TEXT NOT NULL CHECK (document_kind IN ('prescription','transfer')),
  pdf_storage_url TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES profiles(id),
  title           TEXT,
  body            TEXT,
  type            TEXT,
  is_read         INTEGER DEFAULT 0,
  consultation_id TEXT REFERENCES consultations(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT REFERENCES profiles(id),
  doctor_id       TEXT REFERENCES profiles(id),
  consultation_id TEXT REFERENCES consultations(id),
  requested_date  TEXT,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','declined','completed')),
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES consultations(id),
  doctor_id       TEXT REFERENCES profiles(id),
  patient_id      TEXT REFERENCES profiles(id),
  doctor_message  TEXT,
  patient_reply   TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reply_at        TEXT
);

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id                    TEXT PRIMARY KEY,
  doctor_id             TEXT REFERENCES profiles(id),
  day_of_week           INTEGER CHECK (day_of_week BETWEEN 1 AND 7),
  open_time             TEXT,
  close_time            TEXT,
  is_available          INTEGER DEFAULT 1,
  slot_duration_minutes INTEGER DEFAULT 30
);

CREATE TABLE IF NOT EXISTS medicines (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  form           TEXT,
  quantity       INTEGER NOT NULL DEFAULT 0,
  reorder_level  INTEGER NOT NULL DEFAULT 10,
  unit_price     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS dispenses (
  id              TEXT PRIMARY KEY,
  medicine_id     TEXT REFERENCES medicines(id),
  consultation_id TEXT REFERENCES consultations(id),
  patient_id      TEXT REFERENCES profiles(id),
  dispensed_by    TEXT REFERENCES profiles(id),
  quantity        INTEGER NOT NULL,
  unit_price      INTEGER NOT NULL DEFAULT 0,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  id              TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES consultations(id),
  patient_id      TEXT REFERENCES profiles(id),
  doctor_id       TEXT REFERENCES profiles(id),
  stars           INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT,
  action     TEXT,
  entity     TEXT,
  entity_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Helpful indexes for the queue/dashboard queries.
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_consultation ON messages(consultation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor_id, status);
CREATE INDEX IF NOT EXISTS idx_schedules_doctor ON doctor_schedules(doctor_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_dispenses_created ON dispenses(created_at);
CREATE INDEX IF NOT EXISTS idx_dispenses_patient ON dispenses(patient_id);
CREATE INDEX IF NOT EXISTS idx_ratings_doctor ON ratings(doctor_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_consultation ON ratings(consultation_id);
