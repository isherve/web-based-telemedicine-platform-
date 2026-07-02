import { api } from '../data/api';
import type { Appointment, ClinicalDocument, DoctorSchedule, FollowUp, Notification } from '../data/types';

export const appointmentService = {
  book: (body: { consultationId: string; requestedDate: string; notes?: string }) =>
    api.post<{ appointment: Appointment }>('/appointments', body).then((r) => r.appointment),

  listPatient: () =>
    api.get<{ appointments: Appointment[] }>('/appointments/patient').then((r) => r.appointments),

  listDoctor: () =>
    api.get<{ appointments: Appointment[] }>('/appointments/doctor').then((r) => r.appointments),

  updateStatus: (id: string, status: 'confirmed' | 'declined' | 'completed') =>
    api.patch<{ appointment: Appointment }>(`/appointments/${id}/status`, { status }).then((r) => r.appointment),
};

export const scheduleService = {
  get: () => api.get<{ schedule: DoctorSchedule[] }>('/schedules').then((r) => r.schedule),
  save: (slots: Omit<DoctorSchedule, 'id' | 'doctorId'>[]) =>
    api.put<{ schedule: DoctorSchedule[] }>('/schedules', { slots }).then((r) => r.schedule),
  getAvailableDates: () => api.get<{ dates: string[] }>('/schedules/available-dates', false).then((r) => r.dates),
};

export const documentService = {
  list: () => api.get<{ documents: ClinicalDocument[] }>('/documents').then((r) => r.documents),
  create: (consultationId: string, body: { documentKind: 'prescription' | 'transfer'; pdfStorageUrl: string }) =>
    api.post<{ document: ClinicalDocument }>(`/documents/${consultationId}`, body).then((r) => r.document),
};

export const followUpService = {
  listDoctor: () => api.get<{ followUps: FollowUp[] }>('/follow-ups/doctor').then((r) => r.followUps),
  listPatient: () => api.get<{ followUps: FollowUp[] }>('/follow-ups/patient').then((r) => r.followUps),
  send: (consultationId: string, message: string) =>
    api.post<{ followUp: FollowUp }>(`/follow-ups/${consultationId}`, { message }).then((r) => r.followUp),
  reply: (id: string, reply: string) =>
    api.post<{ followUp: FollowUp }>(`/follow-ups/${id}/reply`, { reply }).then((r) => r.followUp),
};

export const notificationService = {
  list: () => api.get<{ notifications: Notification[] }>('/notifications').then((r) => r.notifications),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
};
