import { api } from '../data/api';
import type {
  Consultation,
  DoctorAnalytics,
  DoctorRatings,
  DoctorSchedule,
  DoctorStats,
  Language,
  MyData,
  PatientHistory,
  Profile,
  QueuePosition,
  Rating,
  RegularPatient,
} from '../data/types';

export const consultationService = {
  submitTriage: (body: {
    biologicalSex: string;
    severity: string;
    duration: string;
    symptomCategory: string;
    symptomDescription: string;
    language: Language;
  }) => api.post<{ consultation: Consultation }>('/consultations/triage', body).then((r) => r.consultation),

  listPatient: () =>
    api.get<{ consultations: Consultation[] }>('/consultations/patient').then((r) => r.consultations),

  listDoctor: (status?: string) =>
    api
      .get<{ consultations: Consultation[] }>(
        `/consultations/doctor${status ? `?status=${status}` : ''}`
      )
      .then((r) => r.consultations),

  get: (id: string) =>
    api.get<{ consultation: Consultation }>(`/consultations/${id}`).then((r) => r.consultation),

  submitPayment: (id: string, transactionId: string, provider: 'momo' | 'airtel' = 'momo') =>
    api
      .post<{ consultation: Consultation }>(`/consultations/${id}/submit-payment`, { transactionId, provider })
      .then((r) => r.consultation),

  payViaSystem: (
    id: string,
    body: { provider: 'momo' | 'airtel'; phone: string; pin: string }
  ) =>
    api.post<{ consultation: Consultation; transactionId: string; amount: number }>(
      `/consultations/${id}/pay`,
      body
    ),

  verifyPayment: (id: string, transactionId: string) =>
    api
      .post<{ consultation: Consultation }>(`/consultations/${id}/verify-payment`, { transactionId })
      .then((r) => r.consultation),

  markComplete: (id: string) =>
    api.post<{ consultation: Consultation }>(`/consultations/${id}/complete`).then((r) => r.consultation),

  getDoctorInfo: () => api.get<{ doctor: Profile }>('/consultations/doctor/info').then((r) => r.doctor),

  getStats: () => api.get<DoctorStats>('/consultations/doctor/stats'),

  getRegularPatients: () =>
    api.get<{ patients: RegularPatient[] }>('/consultations/doctor/patients').then((r) => r.patients),

  getPublicSchedule: () =>
    api.get<{ schedule: DoctorSchedule[] }>('/consultations/schedule/public', false).then((r) => r.schedule),

  updateDoctorProfile: (body: { consultationFee?: number; momoNumber?: string; clinicName?: string }) =>
    api.patch<{ doctor: Profile }>('/consultations/doctor/profile', body).then((r) => r.doctor),

  // --- Phase 11 additions ---
  getQueuePosition: (id: string) => api.get<QueuePosition>(`/consultations/${id}/queue-position`),

  getRating: (id: string) =>
    api.get<{ rating: Rating | null }>(`/consultations/${id}/rating`).then((r) => r.rating),

  submitRating: (id: string, stars: number, comment?: string) =>
    api.post<{ ok: boolean }>(`/consultations/${id}/rating`, { stars, comment }),

  getAnalytics: () => api.get<DoctorAnalytics>('/consultations/doctor/analytics'),

  getDoctorRatings: () => api.get<DoctorRatings>('/consultations/doctor/ratings'),

  getPatientHistory: (patientId: string) =>
    api.get<PatientHistory>(`/consultations/patient/${patientId}/history`),

  getMyData: () => api.get<MyData>('/consultations/me/data'),

  updateMyProfile: (body: { allergies?: string; chronicConditions?: string; aiConsent?: boolean }) =>
    api.patch<{ profile: Profile }>('/consultations/me/profile', body).then((r) => r.profile),
};
