import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dataDir = join(__dirname, '..', '..', 'data');
mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.GARA_DB_PATH ?? join(dataDir, 'gara.db');

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations(): void {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Additive migrations for existing databases (SQLite ALTER throws if the
  // column already exists, so we ignore that specific error).
  for (const stmt of [
    'ALTER TABLE consultations ADD COLUMN ai_suggestions TEXT',
    "ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'patient'",
    'ALTER TABLE consultations ADD COLUMN payment_provider TEXT',
    "ALTER TABLE consultations ADD COLUMN urgency TEXT DEFAULT 'low'",
    'ALTER TABLE consultations ADD COLUMN urgency_score INTEGER DEFAULT 0',
    'ALTER TABLE profiles ADD COLUMN allergies TEXT',
    'ALTER TABLE profiles ADD COLUMN chronic_conditions TEXT',
    'ALTER TABLE profiles ADD COLUMN ai_consent INTEGER DEFAULT 0',
    'ALTER TABLE profiles ADD COLUMN consented_at TEXT',
    'ALTER TABLE profiles ADD COLUMN insurance_provider TEXT',
    'ALTER TABLE profiles ADD COLUMN insurance_number TEXT',
    'ALTER TABLE profiles ADD COLUMN insurance_scheme TEXT',
    'ALTER TABLE consultations ADD COLUMN insurance_provider TEXT',
    'ALTER TABLE consultations ADD COLUMN insurance_covered_percent INTEGER DEFAULT 0',
    'ALTER TABLE consultations ADD COLUMN insurance_claim_id TEXT',
  ]) {
    try {
      db.exec(stmt);
    } catch (err) {
      if (!String(err).includes('duplicate column')) throw err;
    }
  }

  // Backfill role for legacy rows. NOTE: ALTER ... ADD COLUMN role DEFAULT 'patient'
  // sets existing rows to 'patient' (not NULL), so we must correct doctors whose
  // role wasn't explicitly set to 'doctor'. Finance/pharmacy staff already carry
  // their correct role and are never doctors, so they are untouched.
  db.exec("UPDATE profiles SET role = 'patient' WHERE role IS NULL AND is_doctor = 0");
  db.exec("UPDATE profiles SET role = 'doctor' WHERE is_doctor = 1 AND role != 'doctor'");
}
