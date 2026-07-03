import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  authService,
  type DoctorRegistration,
  type PatientRegistration,
  type ProfileUpdate,
  type StaffRegistration,
} from '../services/authService';
import { onSessionExpired } from '../data/api';
import type { Profile, Role } from '../data/types';

interface AuthContextValue {
  profile: Profile | null;
  loading: boolean;
  isAuthenticated: boolean;
  isDoctor: boolean;
  role: Role | null;
  registerPatient: (input: PatientRegistration) => Promise<void>;
  registerDoctor: (input: DoctorRegistration) => Promise<void>;
  registerStaff: (input: StaffRegistration) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateLocalProfile: (profile: Profile) => void;
  updateProfile: (input: ProfileUpdate) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .restore()
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  // Any API 401 clears the stale session so the UI returns to login.
  useEffect(() => {
    return onSessionExpired(() => setProfile(null));
  }, []);

  const registerPatient = useCallback(async (input: PatientRegistration) => {
    setProfile(await authService.registerPatient(input));
  }, []);

  const registerDoctor = useCallback(async (input: DoctorRegistration) => {
    setProfile(await authService.registerDoctor(input));
  }, []);

  const registerStaff = useCallback(async (input: StaffRegistration) => {
    setProfile(await authService.registerStaff(input));
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    setProfile(await authService.login(identifier, password));
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setProfile(null);
  }, []);

  const updateLocalProfile = useCallback((p: Profile) => setProfile(p), []);

  const updateProfile = useCallback(async (input: ProfileUpdate) => {
    setProfile(await authService.updateMe(input));
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      await authService.changePassword(currentPassword, newPassword);
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      loading,
      isAuthenticated: !!profile,
      isDoctor: !!profile?.isDoctor,
      role: profile?.role ?? null,
      registerPatient,
      registerDoctor,
      registerStaff,
      login,
      logout,
      updateLocalProfile,
      updateProfile,
      changePassword,
    }),
    [
      profile,
      loading,
      registerPatient,
      registerDoctor,
      registerStaff,
      login,
      logout,
      updateLocalProfile,
      updateProfile,
      changePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
