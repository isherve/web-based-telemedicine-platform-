import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';

/**
 * Password hashing = SHA-256 + a unique 16-byte random salt per user
 * (the documented Gara baseline). Kept in the service layer so it can later be
 * upgraded to bcrypt/argon2 without touching callers.
 */
export function generateSalt(): string {
  return randomBytes(16).toString('hex');
}

export function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex');
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  return hashPassword(password, salt) === hash;
}

export type Role = 'patient' | 'doctor' | 'finance' | 'pharmacy';

export interface ProfileRow {
  id: string;
  phone_number: string | null;
  email: string | null;
  full_name: string | null;
  is_doctor: number;
  role: string | null;
  clinic_name: string | null;
  password_hash: string;
  password_salt: string;
  session_token: string | null;
  reset_otp: string | null;
  reset_otp_expiry: string | null;
  consultation_fee: number | null;
  momo_number: string | null;
  avatar_url: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  ai_consent: number | null;
  consented_at: string | null;
  created_at: string;
}

/** Public shape returned to the client (never leaks hash/salt/otp). */
export interface PublicProfile {
  id: string;
  phoneNumber: string | null;
  email: string | null;
  fullName: string | null;
  isDoctor: boolean;
  role: Role;
  clinicName: string | null;
  consultationFee: number | null;
  momoNumber: string | null;
  avatarUrl: string | null;
  allergies: string | null;
  chronicConditions: string | null;
  aiConsent: boolean;
  createdAt: string;
}

/** Derives role, falling back to is_doctor for legacy rows. */
export function roleOf(row: ProfileRow): Role {
  if (row.role) return row.role as Role;
  return row.is_doctor === 1 ? 'doctor' : 'patient';
}

export function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    email: row.email,
    fullName: row.full_name,
    isDoctor: row.is_doctor === 1,
    role: roleOf(row),
    clinicName: row.clinic_name,
    consultationFee: row.consultation_fee,
    momoNumber: row.momo_number,
    avatarUrl: row.avatar_url,
    allergies: row.allergies,
    chronicConditions: row.chronic_conditions,
    aiConsent: row.ai_consent === 1,
    createdAt: row.created_at,
  };
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface RegisterPatientInput {
  fullName: string;
  phoneNumber: string;
  password: string;
  aiConsent?: boolean;
}

interface RegisterDoctorInput {
  fullName: string;
  email: string;
  password: string;
  clinicName?: string;
  doctorToken: string;
}

interface RegisterStaffInput {
  fullName: string;
  email: string;
  password: string;
  role: 'finance' | 'pharmacy';
  staffToken: string;
}

interface AuthResult {
  profile: PublicProfile;
  sessionToken: string;
}

function issueSession(profileId: string): string {
  const token = randomUUID(); // UUID v4 session token
  db.prepare('UPDATE profiles SET session_token = ? WHERE id = ?').run(token, profileId);
  return token;
}

export function registerPatient(input: RegisterPatientInput): AuthResult {
  const fullName = input.fullName?.trim();
  const phone = input.phoneNumber?.trim();
  if (!fullName || !phone || !input.password) {
    throw new AuthError(400, 'Full name, phone number and password are required.');
  }
  if (input.password.length < 6) {
    throw new AuthError(400, 'Password must be at least 6 characters.');
  }
  const existing = db.prepare('SELECT id FROM profiles WHERE phone_number = ?').get(phone);
  if (existing) throw new AuthError(409, 'An account with this phone number already exists.');

  const id = randomUUID();
  const salt = generateSalt();
  const hash = hashPassword(input.password, salt);
  const consent = input.aiConsent ? 1 : 0;
  db.prepare(
    `INSERT INTO profiles (id, phone_number, full_name, is_doctor, role, password_hash, password_salt, ai_consent, consented_at)
     VALUES (?, ?, ?, 0, 'patient', ?, ?, ?, ?)`
  ).run(id, phone, fullName, hash, salt, consent, consent ? new Date().toISOString() : null);

  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow;
  return { profile: toPublicProfile(row), sessionToken: issueSession(id) };
}

export function registerDoctor(input: RegisterDoctorInput): AuthResult {
  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!fullName || !email || !input.password) {
    throw new AuthError(400, 'Full name, email and password are required.');
  }
  // Doctor gate: one-time token must match the configured registration token.
  const expected = process.env.DOCTOR_REGISTRATION_TOKEN ?? 'gara-doctor-2026';
  if (!input.doctorToken || input.doctorToken.trim() !== expected) {
    throw new AuthError(403, 'Invalid doctor registration token.');
  }
  const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email);
  if (existing) throw new AuthError(409, 'An account with this email already exists.');

  const id = randomUUID();
  const salt = generateSalt();
  const hash = hashPassword(input.password, salt);
  db.prepare(
    `INSERT INTO profiles (id, email, full_name, is_doctor, role, clinic_name, password_hash, password_salt)
     VALUES (?, ?, ?, 1, 'doctor', ?, ?, ?)`
  ).run(id, email, fullName, input.clinicName?.trim() ?? null, hash, salt);

  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow;
  return { profile: toPublicProfile(row), sessionToken: issueSession(id) };
}

/** Registers finance/pharmacy staff, gated by a role-specific one-time token. */
export function registerStaff(input: RegisterStaffInput): AuthResult {
  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!fullName || !email || !input.password) {
    throw new AuthError(400, 'Full name, email and password are required.');
  }
  if (input.role !== 'finance' && input.role !== 'pharmacy') {
    throw new AuthError(400, 'Invalid staff role.');
  }
  const expected =
    input.role === 'finance'
      ? process.env.FINANCE_REGISTRATION_TOKEN ?? 'gara-finance-2026'
      : process.env.PHARMACY_REGISTRATION_TOKEN ?? 'gara-pharmacy-2026';
  if (!input.staffToken || input.staffToken.trim() !== expected) {
    throw new AuthError(403, 'Invalid staff registration token.');
  }
  const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email);
  if (existing) throw new AuthError(409, 'An account with this email already exists.');

  const id = randomUUID();
  const salt = generateSalt();
  const hash = hashPassword(input.password, salt);
  db.prepare(
    `INSERT INTO profiles (id, email, full_name, is_doctor, role, password_hash, password_salt)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).run(id, email, fullName, input.role, hash, salt);

  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as ProfileRow;
  return { profile: toPublicProfile(row), sessionToken: issueSession(id) };
}

export function login(identifier: string, password: string): AuthResult {
  const id = identifier?.trim();
  if (!id || !password) throw new AuthError(400, 'Identifier and password are required.');

  const row = db
    .prepare('SELECT * FROM profiles WHERE phone_number = ? OR email = ?')
    .get(id, id.toLowerCase()) as ProfileRow | undefined;

  if (!row || !verifyPassword(password, row.password_salt, row.password_hash)) {
    throw new AuthError(401, 'Invalid credentials.');
  }
  return { profile: toPublicProfile(row), sessionToken: issueSession(row.id) };
}

/** Resolves a session token to its profile (used by auth middleware). */
export function getProfileBySession(token: string | undefined): ProfileRow | null {
  if (!token) return null;
  const row = db.prepare('SELECT * FROM profiles WHERE session_token = ?').get(token) as
    | ProfileRow
    | undefined;
  return row ?? null;
}

export function logout(token: string | undefined): void {
  if (!token) return;
  db.prepare('UPDATE profiles SET session_token = NULL WHERE session_token = ?').run(token);
}

export interface UpdateProfileInput {
  fullName?: string;
  phoneNumber?: string;
  email?: string;
  clinicName?: string;
  consultationFee?: number;
  momoNumber?: string;
  allergies?: string;
  chronicConditions?: string;
  aiConsent?: boolean;
}

/**
 * Unified self-service profile update. Any authenticated user may edit their own
 * profile; the fields that are actually applied depend on the user's role so a
 * patient can't set a consultation fee and a doctor can't set clinical flags.
 */
export function updateMyProfile(row: ProfileRow, input: UpdateProfileInput): PublicProfile {
  const role = roleOf(row);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, val: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(val);
  };

  // Common to every role.
  if (input.fullName !== undefined) {
    const name = input.fullName.trim();
    if (!name) throw new AuthError(400, 'Full name cannot be empty.');
    push('full_name', name);
  }

  // Contact identifier, validated for uniqueness.
  if (input.phoneNumber !== undefined && role === 'patient') {
    const phone = input.phoneNumber.trim();
    if (!phone) throw new AuthError(400, 'Phone number cannot be empty.');
    const clash = db
      .prepare('SELECT id FROM profiles WHERE phone_number = ? AND id != ?')
      .get(phone, row.id);
    if (clash) throw new AuthError(409, 'That phone number is already in use.');
    push('phone_number', phone);
  }
  if (input.email !== undefined && role !== 'patient') {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new AuthError(400, 'Email cannot be empty.');
    const clash = db.prepare('SELECT id FROM profiles WHERE email = ? AND id != ?').get(email, row.id);
    if (clash) throw new AuthError(409, 'That email is already in use.');
    push('email', email);
  }

  // Doctor practice details.
  if (role === 'doctor') {
    if (input.clinicName !== undefined) push('clinic_name', input.clinicName.trim() || null);
    if (input.momoNumber !== undefined) push('momo_number', input.momoNumber.trim() || null);
    if (input.consultationFee !== undefined) {
      const fee = Number(input.consultationFee);
      push('consultation_fee', Number.isFinite(fee) && fee >= 0 ? Math.round(fee) : null);
    }
  }

  // Patient clinical flags + consent.
  if (role === 'patient') {
    if (input.allergies !== undefined) push('allergies', input.allergies.trim() || null);
    if (input.chronicConditions !== undefined)
      push('chronic_conditions', input.chronicConditions.trim() || null);
    if (input.aiConsent !== undefined) {
      push('ai_consent', input.aiConsent ? 1 : 0);
      push('consented_at', input.aiConsent ? new Date().toISOString() : null);
    }
  }

  if (sets.length) {
    db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals, row.id);
  }
  const updated = db.prepare('SELECT * FROM profiles WHERE id = ?').get(row.id) as ProfileRow;
  return toPublicProfile(updated);
}

/** Self-service password change (verifies the current password first). */
export function changePassword(
  row: ProfileRow,
  currentPassword: string,
  newPassword: string
): void {
  if (!verifyPassword(currentPassword ?? '', row.password_salt, row.password_hash)) {
    throw new AuthError(401, 'Current password is incorrect.');
  }
  if (!newPassword || newPassword.length < 6) {
    throw new AuthError(400, 'New password must be at least 6 characters.');
  }
  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);
  db.prepare('UPDATE profiles SET password_hash = ?, password_salt = ? WHERE id = ?').run(
    hash,
    salt,
    row.id
  );
}
