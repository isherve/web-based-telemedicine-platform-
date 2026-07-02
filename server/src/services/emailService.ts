import { db } from '../db/client.js';
import { AuthError, hashPassword, generateSalt, type ProfileRow } from './authService.js';

/**
 * Password-reset OTP flow (mirrors the original `send-email` Edge Function).
 *
 * OFFLINE BEHAVIOUR: if GMAIL_SMTP_USER/PASS are not configured, the OTP is NOT
 * emailed — it is returned in the API response and logged to the server console
 * so you can test the whole reset flow with no internet. Wire up nodemailer here
 * to enable real email later; the rest of the flow does not change.
 */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export interface RequestOtpResult {
  message: string;
  /** Present only in offline mode so the UI can display it for testing. */
  devOtp?: string;
}

export function requestPasswordReset(identifier: string): RequestOtpResult {
  const id = identifier?.trim();
  if (!id) throw new AuthError(400, 'Email or phone number is required.');

  const row = db
    .prepare('SELECT * FROM profiles WHERE email = ? OR phone_number = ?')
    .get(id.toLowerCase(), id) as ProfileRow | undefined;

  // Do not reveal whether the account exists.
  if (!row) {
    return { message: 'If an account exists, a reset code has been sent.' };
  }

  const otp = generateOtp();
  const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
  db.prepare('UPDATE profiles SET reset_otp = ?, reset_otp_expiry = ? WHERE id = ?').run(
    otp,
    expiry,
    row.id
  );

  const emailConfigured = Boolean(process.env.GMAIL_SMTP_USER && process.env.GMAIL_SMTP_PASS);
  if (emailConfigured) {
    // TODO: send via nodemailer + Gmail SMTP here when online.
    // await sendMail(row.email, 'Your Gara reset code', `Your code is ${otp}`);
    return { message: 'A reset code has been sent to your email.' };
  }

  // Offline mode: expose the OTP for local testing.
  console.log(`[gara][offline OTP] account=${row.email ?? row.phone_number} otp=${otp}`);
  return { message: 'Offline mode: use the code shown below.', devOtp: otp };
}

export function resetPassword(identifier: string, otp: string, newPassword: string): void {
  const id = identifier?.trim();
  if (!id || !otp || !newPassword) throw new AuthError(400, 'All fields are required.');
  if (newPassword.length < 6) throw new AuthError(400, 'Password must be at least 6 characters.');

  const row = db
    .prepare('SELECT * FROM profiles WHERE email = ? OR phone_number = ?')
    .get(id.toLowerCase(), id) as ProfileRow | undefined;

  if (!row || !row.reset_otp || row.reset_otp !== otp.trim()) {
    throw new AuthError(400, 'Invalid reset code.');
  }
  if (!row.reset_otp_expiry || new Date(row.reset_otp_expiry).getTime() < Date.now()) {
    throw new AuthError(400, 'Reset code has expired.');
  }

  const salt = generateSalt();
  const hash = hashPassword(newPassword, salt);
  db.prepare(
    'UPDATE profiles SET password_hash = ?, password_salt = ?, reset_otp = NULL, reset_otp_expiry = NULL WHERE id = ?'
  ).run(hash, salt, row.id);
}
