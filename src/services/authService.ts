// Auth service (business logic layer). Wraps the API client and manages the
// session token. Providers call this; it never touches React state itself.
import { api, setSessionToken, getSessionToken } from '../data/api';
import type { AuthResult, Profile } from '../data/types';

export interface PatientRegistration {
  fullName: string;
  phoneNumber: string;
  password: string;
  aiConsent?: boolean;
}

export interface DoctorRegistration {
  fullName: string;
  email: string;
  password: string;
  clinicName?: string;
  doctorToken: string;
}

export interface StaffRegistration {
  fullName: string;
  email: string;
  password: string;
  role: 'finance' | 'pharmacy';
  staffToken: string;
}

export interface ProfileUpdate {
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

async function persistSession(result: AuthResult): Promise<Profile> {
  setSessionToken(result.sessionToken);
  return result.profile;
}

export const authService = {
  async registerPatient(input: PatientRegistration): Promise<Profile> {
    const result = await api.post<AuthResult>('/auth/register/patient', input, false);
    return persistSession(result);
  },

  async registerDoctor(input: DoctorRegistration): Promise<Profile> {
    const result = await api.post<AuthResult>('/auth/register/doctor', input, false);
    return persistSession(result);
  },

  async registerStaff(input: StaffRegistration): Promise<Profile> {
    const result = await api.post<AuthResult>('/auth/register/staff', input, false);
    return persistSession(result);
  },

  async login(identifier: string, password: string): Promise<Profile> {
    const result = await api.post<AuthResult>('/auth/login', { identifier, password }, false);
    return persistSession(result);
  },

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } finally {
      setSessionToken(null);
    }
  },

  /** Restores the profile from an existing session token (app boot). */
  async restore(): Promise<Profile | null> {
    if (!getSessionToken()) return null;
    try {
      const { profile } = await api.get<{ profile: Profile }>('/auth/me');
      return profile;
    } catch {
      setSessionToken(null);
      return null;
    }
  },

  async updateMe(input: ProfileUpdate): Promise<Profile> {
    const { profile } = await api.patch<{ profile: Profile }>('/auth/me', input);
    return profile;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },

  async requestPasswordReset(identifier: string): Promise<{ message: string; devOtp?: string }> {
    return api.post('/auth/reset/request', { identifier }, false);
  },

  async confirmPasswordReset(identifier: string, otp: string, newPassword: string): Promise<void> {
    await api.post('/auth/reset/confirm', { identifier, otp, newPassword }, false);
  },
};
