import { api } from '../data/api';
import type { Vital, EPrescription, RxItem, LabOrder } from '../data/types';

export const clinicalService = {
  /* Vitals */
  recordVitals: (body: {
    patientId?: string;
    consultationId?: string;
    systolic?: number;
    diastolic?: number;
    heartRate?: number;
    temperature?: number;
    weight?: number;
    bloodSugar?: number;
    spo2?: number;
    note?: string;
  }) => api.post<{ vital: Vital }>('/clinical/vitals', body).then((r) => r.vital),

  listVitals: (patientId: string) =>
    api.get<{ vitals: Vital[] }>(`/clinical/vitals/${patientId}`).then((r) => r.vitals),

  /* Prescriptions (structured) */
  createPrescription: (body: {
    patientId: string;
    consultationId?: string;
    note?: string;
    items: RxItem[];
  }) =>
    api.post<{ prescription: EPrescription; warnings: string[] }>('/clinical/prescriptions', body),

  activePrescriptions: () =>
    api.get<{ prescriptions: EPrescription[] }>('/clinical/prescriptions/active').then((r) => r.prescriptions),

  myPrescriptions: () =>
    api.get<{ prescriptions: EPrescription[] }>('/clinical/prescriptions/mine').then((r) => r.prescriptions),

  prescriptionsForPatient: (patientId: string) =>
    api
      .get<{ prescriptions: EPrescription[] }>(`/clinical/prescriptions/patient/${patientId}`)
      .then((r) => r.prescriptions),

  dispensePrescription: (id: string) =>
    api.post<{ prescription: EPrescription }>(`/clinical/prescriptions/${id}/dispense`).then((r) => r.prescription),

  /* Lab orders */
  createLabOrder: (body: { patientId: string; consultationId?: string; testName: string; note?: string }) =>
    api.post<{ labOrder: LabOrder }>('/clinical/lab-orders', body).then((r) => r.labOrder),

  myLabOrders: () =>
    api.get<{ labOrders: LabOrder[] }>('/clinical/lab-orders/mine').then((r) => r.labOrders),

  allLabOrders: (status?: string) =>
    api
      .get<{ labOrders: LabOrder[] }>(`/clinical/lab-orders${status ? `?status=${status}` : ''}`)
      .then((r) => r.labOrders),

  labOrdersForPatient: (patientId: string) =>
    api.get<{ labOrders: LabOrder[] }>(`/clinical/lab-orders/patient/${patientId}`).then((r) => r.labOrders),

  completeLabOrder: (id: string, result: string) =>
    api.post<{ labOrder: LabOrder }>(`/clinical/lab-orders/${id}/complete`, { result }).then((r) => r.labOrder),
};
