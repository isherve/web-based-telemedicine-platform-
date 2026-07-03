import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';
import { createNotification } from './notificationService.js';
import { checkSafety } from './pharmacyService.js';

/* ---------------------------------------------------------------------------
 * Vitals / measurements
 * ------------------------------------------------------------------------- */

export interface VitalsInput {
  patientId: string;
  consultationId?: string;
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  temperature?: number;
  weight?: number;
  bloodSugar?: number;
  spo2?: number;
  note?: string;
}

function mapVital(r: Record<string, unknown>) {
  return {
    id: r.id,
    patientId: r.patient_id,
    consultationId: r.consultation_id,
    recordedBy: r.recorded_by,
    systolic: r.systolic,
    diastolic: r.diastolic,
    heartRate: r.heart_rate,
    temperature: r.temperature,
    weight: r.weight,
    bloodSugar: r.blood_sugar,
    spo2: r.spo2,
    note: r.note,
    createdAt: r.created_at,
    recordedByName: r.recorded_by_name ?? null,
  };
}

const numOrNull = (v: unknown) => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || Number.isNaN(n) ? null : n;
};

export function recordVitals(recordedBy: string, input: VitalsInput) {
  if (!input.patientId) throw new ServiceError(400, 'Patient is required.');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO vitals
       (id, patient_id, consultation_id, recorded_by, systolic, diastolic, heart_rate,
        temperature, weight, blood_sugar, spo2, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.patientId,
    input.consultationId ?? null,
    recordedBy,
    numOrNull(input.systolic),
    numOrNull(input.diastolic),
    numOrNull(input.heartRate),
    numOrNull(input.temperature),
    numOrNull(input.weight),
    numOrNull(input.bloodSugar),
    numOrNull(input.spo2),
    input.note?.trim() || null
  );
  return getVital(id);
}

function getVital(id: string) {
  const row = db
    .prepare(
      `SELECT v.*, p.full_name AS recorded_by_name FROM vitals v
       LEFT JOIN profiles p ON p.id = v.recorded_by WHERE v.id = ?`
    )
    .get(id) as Record<string, unknown>;
  return mapVital(row);
}

export function listVitals(patientId: string, limit = 200) {
  const rows = db
    .prepare(
      `SELECT v.*, p.full_name AS recorded_by_name FROM vitals v
       LEFT JOIN profiles p ON p.id = v.recorded_by
       WHERE v.patient_id = ? ORDER BY v.created_at ASC LIMIT ?`
    )
    .all(patientId, limit) as Record<string, unknown>[];
  return rows.map(mapVital);
}

/* ---------------------------------------------------------------------------
 * Structured e-prescriptions
 * ------------------------------------------------------------------------- */

export interface PrescriptionItemInput {
  medicineId?: string;
  medicineName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  instructions?: string;
}

function mapRxItem(r: Record<string, unknown>) {
  return {
    id: r.id,
    prescriptionId: r.prescription_id,
    medicineId: r.medicine_id,
    medicineName: r.medicine_name,
    dosage: r.dosage,
    frequency: r.frequency,
    duration: r.duration,
    quantity: r.quantity,
    instructions: r.instructions,
    dispensed: r.dispensed === 1,
  };
}

function mapPrescription(r: Record<string, unknown>, items: Record<string, unknown>[]) {
  return {
    id: r.id,
    consultationId: r.consultation_id,
    patientId: r.patient_id,
    doctorId: r.doctor_id,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    patientName: r.patient_name ?? null,
    doctorName: r.doctor_name ?? null,
    items: items.map(mapRxItem),
  };
}

export function createPrescription(
  doctorId: string,
  input: { patientId: string; consultationId?: string; note?: string; items: PrescriptionItemInput[] }
) {
  if (!input.patientId) throw new ServiceError(400, 'Patient is required.');
  const items = (input.items ?? []).filter((i) => i.medicineName?.trim());
  if (items.length === 0) throw new ServiceError(400, 'At least one medicine is required.');

  // Aggregate safety warnings across all items (allergy + interaction checks).
  const warnings: string[] = [];
  for (const it of items) {
    for (const w of checkSafety(input.patientId, it.medicineName)) warnings.push(w);
  }

  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO prescriptions (id, consultation_id, patient_id, doctor_id, note)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, input.consultationId ?? null, input.patientId, doctorId, input.note?.trim() || null);
    const insItem = db.prepare(
      `INSERT INTO prescription_items
         (id, prescription_id, medicine_id, medicine_name, dosage, frequency, duration, quantity, instructions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const it of items) {
      insItem.run(
        randomUUID(),
        id,
        it.medicineId ?? null,
        it.medicineName.trim(),
        it.dosage?.trim() || null,
        it.frequency?.trim() || null,
        it.duration?.trim() || null,
        Math.max(1, Math.floor(Number(it.quantity) || 1)),
        it.instructions?.trim() || null
      );
    }
  });
  tx();

  createNotification({
    userId: input.patientId,
    title: 'New prescription',
    body: `Dr. issued a prescription with ${items.length} medicine(s).`,
    type: 'prescription',
    consultationId: input.consultationId,
  });

  return { prescription: getPrescription(id), warnings: [...new Set(warnings)] };
}

export function getPrescription(id: string) {
  const row = db
    .prepare(
      `SELECT rx.*, pt.full_name AS patient_name, dr.full_name AS doctor_name
       FROM prescriptions rx
       LEFT JOIN profiles pt ON pt.id = rx.patient_id
       LEFT JOIN profiles dr ON dr.id = rx.doctor_id
       WHERE rx.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw new ServiceError(404, 'Prescription not found.');
  const items = db
    .prepare('SELECT * FROM prescription_items WHERE prescription_id = ?')
    .all(id) as Record<string, unknown>[];
  return mapPrescription(row, items);
}

export function listPrescriptionsByPatient(patientId: string) {
  const rows = db
    .prepare(
      `SELECT rx.*, dr.full_name AS doctor_name FROM prescriptions rx
       LEFT JOIN profiles dr ON dr.id = rx.doctor_id
       WHERE rx.patient_id = ? ORDER BY rx.created_at DESC`
    )
    .all(patientId) as Record<string, unknown>[];
  return rows.map((r) =>
    mapPrescription(
      r,
      db.prepare('SELECT * FROM prescription_items WHERE prescription_id = ?').all(r.id as string) as Record<
        string,
        unknown
      >[]
    )
  );
}

/** Active structured prescriptions across all patients — the pharmacy queue. */
export function listActivePrescriptions() {
  const rows = db
    .prepare(
      `SELECT rx.*, pt.full_name AS patient_name, dr.full_name AS doctor_name FROM prescriptions rx
       LEFT JOIN profiles pt ON pt.id = rx.patient_id
       LEFT JOIN profiles dr ON dr.id = rx.doctor_id
       WHERE rx.status = 'active' ORDER BY rx.created_at DESC LIMIT 100`
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) =>
    mapPrescription(
      r,
      db.prepare('SELECT * FROM prescription_items WHERE prescription_id = ?').all(r.id as string) as Record<
        string,
        unknown
      >[]
    )
  );
}

export function markPrescriptionDispensed(id: string) {
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!rx) throw new ServiceError(404, 'Prescription not found.');
  db.prepare("UPDATE prescriptions SET status = 'dispensed' WHERE id = ?").run(id);
  db.prepare('UPDATE prescription_items SET dispensed = 1 WHERE prescription_id = ?').run(id);
  createNotification({
    userId: rx.patient_id as string,
    title: 'Prescription dispensed',
    body: 'Your prescription has been dispensed by the pharmacy.',
    type: 'prescription',
  });
  return getPrescription(id);
}

/* ---------------------------------------------------------------------------
 * Lab test orders
 * ------------------------------------------------------------------------- */

function mapLab(r: Record<string, unknown>) {
  return {
    id: r.id,
    consultationId: r.consultation_id,
    patientId: r.patient_id,
    doctorId: r.doctor_id,
    testName: r.test_name,
    status: r.status,
    result: r.result,
    resultAt: r.result_at,
    note: r.note,
    createdAt: r.created_at,
    patientName: r.patient_name ?? null,
  };
}

export function createLabOrder(
  doctorId: string,
  input: { patientId: string; consultationId?: string; testName: string; note?: string }
) {
  if (!input.patientId) throw new ServiceError(400, 'Patient is required.');
  if (!input.testName?.trim()) throw new ServiceError(400, 'Test name is required.');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO lab_orders (id, consultation_id, patient_id, doctor_id, test_name, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.consultationId ?? null, input.patientId, doctorId, input.testName.trim(), input.note?.trim() || null);
  createNotification({
    userId: input.patientId,
    title: 'Lab test ordered',
    body: `A lab test was ordered: ${input.testName.trim()}.`,
    type: 'lab_order',
    consultationId: input.consultationId,
  });
  return getLabOrder(id);
}

function getLabOrder(id: string) {
  const row = db
    .prepare(
      `SELECT l.*, p.full_name AS patient_name FROM lab_orders l
       LEFT JOIN profiles p ON p.id = l.patient_id WHERE l.id = ?`
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) throw new ServiceError(404, 'Lab order not found.');
  return mapLab(row);
}

export function listLabOrdersByPatient(patientId: string) {
  const rows = db
    .prepare('SELECT * FROM lab_orders WHERE patient_id = ? ORDER BY created_at DESC')
    .all(patientId) as Record<string, unknown>[];
  return rows.map(mapLab);
}

export function listAllLabOrders(status?: string) {
  const rows = (
    status
      ? db.prepare(
          `SELECT l.*, p.full_name AS patient_name FROM lab_orders l
           LEFT JOIN profiles p ON p.id = l.patient_id WHERE l.status = ? ORDER BY l.created_at DESC LIMIT 200`
        ).all(status)
      : db.prepare(
          `SELECT l.*, p.full_name AS patient_name FROM lab_orders l
           LEFT JOIN profiles p ON p.id = l.patient_id ORDER BY l.created_at DESC LIMIT 200`
        ).all()
  ) as Record<string, unknown>[];
  return rows.map(mapLab);
}

export function completeLabOrder(id: string, result: string) {
  const row = db.prepare('SELECT * FROM lab_orders WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ServiceError(404, 'Lab order not found.');
  db.prepare(
    "UPDATE lab_orders SET status = 'completed', result = ?, result_at = ? WHERE id = ?"
  ).run(result?.trim() || null, new Date().toISOString(), id);
  createNotification({
    userId: row.patient_id as string,
    title: 'Lab result ready',
    body: `Result for ${row.test_name} is now available.`,
    type: 'lab_order',
  });
  return getLabOrder(id);
}
