import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { createNotification } from './notificationService.js';
import { ServiceError } from './consultationService.js';

export function listDoctorFollowUps(doctorId: string) {
  const rows = db
    .prepare(
      `SELECT f.*, p.full_name AS patient_name FROM follow_ups f
       LEFT JOIN profiles p ON p.id = f.patient_id
       WHERE f.doctor_id = ? ORDER BY f.created_at DESC`
    )
    .all(doctorId) as Record<string, unknown>[];
  return rows.map(mapFollowUp);
}

export function listPatientFollowUps(patientId: string) {
  const rows = db
    .prepare('SELECT * FROM follow_ups WHERE patient_id = ? ORDER BY created_at DESC')
    .all(patientId) as Record<string, unknown>[];
  return rows.map(mapFollowUp);
}

export function sendFollowUp(doctorId: string, consultationId: string, message: string) {
  const c = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!c) throw new ServiceError(404, 'Consultation not found.');
  if (c.doctor_id !== doctorId) throw new ServiceError(403, 'Access denied.');
  if (c.status !== 'complete') throw new ServiceError(400, 'Follow-ups are only for completed consultations.');

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO follow_ups (id, consultation_id, doctor_id, patient_id, doctor_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, consultationId, doctorId, c.patient_id, message, now);

  createNotification({
    userId: c.patient_id as string,
    title: 'Follow-up from your doctor',
    body: message.slice(0, 120),
    type: 'follow_up',
    consultationId,
  });

  return mapFollowUp(db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(id) as Record<string, unknown>);
}

export function replyFollowUp(patientId: string, followUpId: string, reply: string) {
  const f = db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(followUpId) as
    | Record<string, unknown>
    | undefined;
  if (!f) throw new ServiceError(404, 'Follow-up not found.');
  if (f.patient_id !== patientId) throw new ServiceError(403, 'Access denied.');

  const now = new Date().toISOString();
  db.prepare('UPDATE follow_ups SET patient_reply = ?, reply_at = ? WHERE id = ?').run(
    reply,
    now,
    followUpId
  );

  createNotification({
    userId: f.doctor_id as string,
    title: 'Patient follow-up reply',
    body: reply.slice(0, 120),
    type: 'follow_up_reply',
    consultationId: f.consultation_id as string,
  });

  return mapFollowUp(db.prepare('SELECT * FROM follow_ups WHERE id = ?').get(followUpId) as Record<string, unknown>);
}

function mapFollowUp(r: Record<string, unknown>) {
  return {
    id: r.id,
    consultationId: r.consultation_id,
    doctorId: r.doctor_id,
    patientId: r.patient_id,
    doctorMessage: r.doctor_message,
    patientReply: r.patient_reply,
    createdAt: r.created_at,
    replyAt: r.reply_at,
    patientName: r.patient_name ?? null,
  };
}
