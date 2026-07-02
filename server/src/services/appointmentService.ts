import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { createNotification } from './notificationService.js';
import { ServiceError } from './consultationService.js';

// Known gap: no double-booking prevention yet — stub for future server-side check.
export function checkSlotAvailable(_doctorId: string, _date: string): boolean {
  return true;
}

export function bookAppointment(
  patientId: string,
  input: { consultationId: string; requestedDate: string; notes?: string }
) {
  const c = db.prepare('SELECT * FROM consultations WHERE id = ?').get(input.consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!c) throw new ServiceError(404, 'Consultation not found.');
  if (c.patient_id !== patientId) throw new ServiceError(403, 'Access denied.');

  if (!checkSlotAvailable(c.doctor_id as string, input.requestedDate)) {
    throw new ServiceError(409, 'Slot not available.');
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO appointments (id, patient_id, doctor_id, consultation_id, requested_date, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    patientId,
    c.doctor_id,
    input.consultationId,
    input.requestedDate,
    input.notes ?? null,
    now
  );

  createNotification({
    userId: c.doctor_id as string,
    title: 'New booking request',
    body: `Appointment requested for ${input.requestedDate}`,
    type: 'appointment_new',
    consultationId: input.consultationId,
  });

  return mapAppointment(
    db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as Record<string, unknown>
  );
}

export function listDoctorAppointments(doctorId: string) {
  const rows = db
    .prepare(
      `SELECT a.*, p.full_name AS patient_name FROM appointments a
       LEFT JOIN profiles p ON p.id = a.patient_id
       WHERE a.doctor_id = ? ORDER BY a.created_at DESC`
    )
    .all(doctorId) as Record<string, unknown>[];
  return rows.map(mapAppointment);
}

export function listPatientAppointments(patientId: string) {
  const rows = db
    .prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY created_at DESC')
    .all(patientId) as Record<string, unknown>[];
  return rows.map(mapAppointment);
}

export function updateAppointmentStatus(
  doctorId: string,
  appointmentId: string,
  status: 'confirmed' | 'declined' | 'completed'
) {
  const a = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId) as
    | Record<string, unknown>
    | undefined;
  if (!a) throw new ServiceError(404, 'Appointment not found.');
  if (a.doctor_id !== doctorId) throw new ServiceError(403, 'Access denied.');

  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, appointmentId);

  createNotification({
    userId: a.patient_id as string,
    title: 'Appointment update',
    body: `Your appointment was ${status}.`,
    type: 'appointment_update',
    consultationId: a.consultation_id as string,
  });

  return mapAppointment(
    db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId) as Record<string, unknown>
  );
}

function mapAppointment(r: Record<string, unknown>) {
  return {
    id: r.id,
    patientId: r.patient_id,
    doctorId: r.doctor_id,
    consultationId: r.consultation_id,
    requestedDate: r.requested_date,
    status: r.status,
    notes: r.notes,
    createdAt: r.created_at,
    patientName: r.patient_name ?? null,
  };
}
