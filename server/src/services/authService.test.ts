import { describe, expect, it } from 'vitest';
import { runMigrations } from '../db/client.js';
import {
  AuthError,
  generateSalt,
  hashPassword,
  login,
  registerDoctor,
  registerPatient,
  verifyPassword,
} from './authService.js';

runMigrations();

describe('password hashing (SHA-256 + salt)', () => {
  it('produces a verifiable hash', () => {
    const salt = generateSalt();
    const hash = hashPassword('s3cret!', salt);
    expect(verifyPassword('s3cret!', salt, hash)).toBe(true);
    expect(verifyPassword('wrong', salt, hash)).toBe(false);
  });

  it('uses a unique 16-byte (32 hex char) salt per call', () => {
    expect(generateSalt()).toHaveLength(32);
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('registration + login', () => {
  it('registers a patient and logs in with phone', () => {
    const reg = registerPatient({ fullName: 'Amina K', phoneNumber: '+250780000001', password: 'pass123' });
    expect(reg.profile.isDoctor).toBe(false);
    expect(reg.sessionToken).toBeTruthy();

    const li = login('+250780000001', 'pass123');
    expect(li.profile.id).toBe(reg.profile.id);
  });

  it('rejects duplicate phone numbers', () => {
    registerPatient({ fullName: 'Dup A', phoneNumber: '+250780000009', password: 'pass123' });
    expect(() =>
      registerPatient({ fullName: 'Dup B', phoneNumber: '+250780000009', password: 'pass123' })
    ).toThrow(AuthError);
  });

  it('enforces the doctor token gate', () => {
    expect(() =>
      registerDoctor({ fullName: 'Dr X', email: 'x@clinic.rw', password: 'pass123', doctorToken: 'nope' })
    ).toThrow(/Invalid doctor registration token/);

    const ok = registerDoctor({
      fullName: 'Dr Y',
      email: 'y@clinic.rw',
      password: 'pass123',
      doctorToken: 'test-token',
    });
    expect(ok.profile.isDoctor).toBe(true);
  });

  it('rejects bad credentials', () => {
    expect(() => login('+250780000001', 'wrong')).toThrow(/Invalid credentials/);
  });
});
