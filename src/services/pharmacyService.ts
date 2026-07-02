import { api } from '../data/api';
import type { Consultation, Dispense, Medicine, Prescription } from '../data/types';

export const pharmacyService = {
  listMedicines: () =>
    api.get<{ medicines: Medicine[] }>('/pharmacy/medicines').then((r) => r.medicines),

  addMedicine: (body: {
    name: string;
    form?: string;
    quantity?: number;
    reorderLevel?: number;
    unitPrice?: number;
  }) => api.post<{ medicine: Medicine }>('/pharmacy/medicines', body).then((r) => r.medicine),

  updateMedicine: (id: string, body: Partial<Medicine>) =>
    api.patch<{ medicine: Medicine }>(`/pharmacy/medicines/${id}`, body).then((r) => r.medicine),

  restock: (id: string, amount: number) =>
    api.post<{ medicine: Medicine }>(`/pharmacy/medicines/${id}/restock`, { amount }).then((r) => r.medicine),

  dispense: (body: {
    medicineId: string;
    quantity: number;
    patientId?: string;
    consultationId?: string;
    note?: string;
  }) => api.post<{ dispense: Dispense; medicine: Medicine; warnings: string[] }>('/pharmacy/dispense', body),

  safetyCheck: (medicineId: string, patientId?: string) =>
    api
      .get<{ warnings: string[] }>(
        `/pharmacy/safety-check?medicineId=${encodeURIComponent(medicineId)}${patientId ? `&patientId=${encodeURIComponent(patientId)}` : ''}`
      )
      .then((r) => r.warnings),

  listDispenses: () =>
    api.get<{ dispenses: Dispense[] }>('/pharmacy/dispenses').then((r) => r.dispenses),

  listPrescriptions: () =>
    api.get<{ prescriptions: Prescription[] }>('/pharmacy/prescriptions').then((r) => r.prescriptions),
};

export const financeService = {
  pendingPayments: () =>
    api.get<{ consultations: Consultation[] }>('/consultations/pending-payments').then((r) => r.consultations),

  verifyPayment: (id: string, transactionId: string) =>
    api
      .post<{ consultation: Consultation }>(`/consultations/${id}/verify-payment`, { transactionId })
      .then((r) => r.consultation),
};
