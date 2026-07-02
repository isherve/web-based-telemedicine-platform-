import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';

/** Patient rates a completed consultation (once). */
export function submitRating(
  patientId: string,
  consultationId: string,
  stars: number,
  comment?: string
) {
  const c = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!c) throw new ServiceError(404, 'Consultation not found.');
  if (c.patient_id !== patientId) throw new ServiceError(403, 'Access denied.');
  if (c.status !== 'complete') throw new ServiceError(400, 'You can only rate a completed consultation.');

  const n = Math.round(Number(stars));
  if (!n || n < 1 || n > 5) throw new ServiceError(400, 'Rating must be between 1 and 5 stars.');

  const existing = db.prepare('SELECT id FROM ratings WHERE consultation_id = ?').get(consultationId);
  if (existing) throw new ServiceError(409, 'You already rated this consultation.');

  db.prepare(
    `INSERT INTO ratings (id, consultation_id, patient_id, doctor_id, stars, comment)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), consultationId, patientId, c.doctor_id, n, comment?.trim() || null);

  return { ok: true };
}

/** Whether the patient has already rated a consultation. */
export function getRating(consultationId: string) {
  const r = db.prepare('SELECT stars, comment FROM ratings WHERE consultation_id = ?').get(consultationId) as
    | { stars: number; comment: string | null }
    | undefined;
  return r ?? null;
}

/** Rating summary + recent comments for a doctor. */
export function getDoctorRatings(doctorId: string) {
  const summary = db
    .prepare('SELECT COALESCE(AVG(stars),0) AS avg, COUNT(*) AS count FROM ratings WHERE doctor_id = ?')
    .get(doctorId) as { avg: number; count: number };
  const recent = db
    .prepare(
      `SELECT r.stars, r.comment, r.created_at, p.full_name AS patient_name
       FROM ratings r LEFT JOIN profiles p ON p.id = r.patient_id
       WHERE r.doctor_id = ? ORDER BY r.created_at DESC LIMIT 20`
    )
    .all(doctorId) as Record<string, unknown>[];
  return {
    average: Math.round((summary.avg ?? 0) * 10) / 10,
    count: summary.count ?? 0,
    recent: recent.map((r) => ({
      stars: r.stars,
      comment: r.comment,
      createdAt: r.created_at,
      patientName: r.patient_name,
    })),
  };
}
