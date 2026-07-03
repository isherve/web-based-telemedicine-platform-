import { db } from '../db/client.js';
import { ServiceError, logAudit } from './consultationService.js';
import { createNotification } from './notificationService.js';
import { mapConsultation } from '../utils/mappers.js';
import { assignmentRationale, type Lang } from './aiService.js';

/**
 * Smart patient→doctor assignment.
 *
 * A coordinator (admin/finance) — or the AI auto-assigner — decides which doctor
 * should handle a consultation by READING EACH DOCTOR'S SCHEDULE plus their live
 * workload and rating. The doctor who is on duty right now (per doctor_schedules)
 * with the lightest queue and best rating scores highest.
 */

export interface DoctorCandidate {
  id: string;
  fullName: string | null;
  clinicName: string | null;
  onDuty: boolean;
  availableToday: boolean;
  todayOpen: string | null;
  todayClose: string | null;
  activeLoad: number; // consultations currently in_process
  waitingLoad: number; // consultations pending_payment
  totalOpen: number;
  avgRating: number | null;
  score: number;
  reasons: string[];
}

export interface AssignmentConsultation {
  id: string;
  patientId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  doctorId: string | null;
  doctorName: string | null;
  status: string;
  symptomCategory: string | null;
  urgency: string;
  urgencyScore: number;
  createdAt: string;
}

export interface AssignmentSuggestion {
  consultationId: string;
  recommendedDoctorId: string | null;
  summary: string;
  candidates: DoctorCandidate[];
}

/** ISO day-of-week 1..7 (Mon..Sun) for the given instant. */
function isoDayOfWeek(when: Date): number {
  const d = when.getDay(); // 0=Sun..6=Sat
  return d === 0 ? 7 : d;
}

/** "HH:MM" local time. */
function hhmm(when: Date): string {
  return when.toTimeString().slice(0, 5);
}

function todaysSchedule(doctorId: string, when: Date): Record<string, unknown> | undefined {
  return db
    .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?')
    .get(doctorId, isoDayOfWeek(when)) as Record<string, unknown> | undefined;
}

/**
 * Rank every doctor for the current moment (or a supplied instant) using the
 * schedule + workload + rating. Returned sorted best-first.
 */
export function listDoctorCandidates(when: Date = new Date()): DoctorCandidate[] {
  const doctors = db
    .prepare('SELECT id, full_name, clinic_name FROM profiles WHERE is_doctor = 1')
    .all() as Record<string, unknown>[];

  const loadRows = db
    .prepare(
      `SELECT doctor_id,
         SUM(CASE WHEN status = 'in_process' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS waiting
       FROM consultations
       WHERE doctor_id IS NOT NULL
       GROUP BY doctor_id`
    )
    .all() as Record<string, unknown>[];
  const loadMap = new Map<string, { active: number; waiting: number }>();
  for (const l of loadRows) {
    loadMap.set(l.doctor_id as string, {
      active: Number(l.active) || 0,
      waiting: Number(l.waiting) || 0,
    });
  }

  const ratingRows = db
    .prepare('SELECT doctor_id, AVG(stars) AS avg FROM ratings GROUP BY doctor_id')
    .all() as Record<string, unknown>[];
  const ratingMap = new Map<string, number>();
  for (const r of ratingRows) ratingMap.set(r.doctor_id as string, Number(r.avg));

  const now = hhmm(when);

  const candidates = doctors.map((doc): DoctorCandidate => {
    const id = doc.id as string;
    const fullName = (doc.full_name as string) ?? null;
    const clinicName = (doc.clinic_name as string) ?? null;
    const load = loadMap.get(id) ?? { active: 0, waiting: 0 };
    const avgRating = ratingMap.get(id) ?? null;

    const sched = todaysSchedule(id, when);
    const availableToday = !!sched && sched.is_available === 1;
    let todayOpen: string | null = null;
    let todayClose: string | null = null;
    let onDuty = false;
    if (availableToday) {
      todayOpen = (sched!.open_time as string) ?? null;
      todayClose = (sched!.close_time as string) ?? null;
      // No explicit hours means available all day.
      onDuty = !todayOpen || !todayClose ? true : now >= todayOpen && now <= todayClose;
    }

    const totalOpen = load.active + load.waiting;
    const reasons: string[] = [];
    let score = 0;

    if (onDuty) {
      score += 50;
      reasons.push('On duty now');
    } else if (availableToday) {
      score += 12;
      reasons.push(`Available today ${todayOpen ?? ''}–${todayClose ?? ''}`.trim());
    } else {
      reasons.push('Not scheduled today');
    }

    score -= totalOpen * 8;
    reasons.push(totalOpen === 0 ? 'No current load' : `${load.active} active / ${load.waiting} waiting`);

    if (avgRating != null) {
      score += avgRating * 3;
      reasons.push(`${avgRating.toFixed(1)}★ rating`);
    }

    return {
      id,
      fullName,
      clinicName,
      onDuty,
      availableToday,
      todayOpen,
      todayClose,
      activeLoad: load.active,
      waitingLoad: load.waiting,
      totalOpen,
      avgRating,
      score: Math.round(score),
      reasons,
    };
  });

  return candidates.sort((a, b) => b.score - a.score);
}

/** Consultations that a coordinator may (re)assign — the active pipeline. */
export function listConsultationsForAssignment(): AssignmentConsultation[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.patient_id, c.doctor_id, c.status, c.symptom_category,
              c.urgency, c.urgency_score, c.created_at,
              p.full_name AS patient_name, p.phone_number AS patient_phone,
              d.full_name AS doctor_name
       FROM consultations c
       LEFT JOIN profiles p ON p.id = c.patient_id
       LEFT JOIN profiles d ON d.id = c.doctor_id
       WHERE c.status IN ('pending_payment', 'in_process')
       ORDER BY c.urgency_score DESC, c.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r.id as string,
    patientId: (r.patient_id as string) ?? null,
    patientName: (r.patient_name as string) ?? null,
    patientPhone: (r.patient_phone as string) ?? null,
    doctorId: (r.doctor_id as string) ?? null,
    doctorName: (r.doctor_name as string) ?? null,
    status: r.status as string,
    symptomCategory: (r.symptom_category as string) ?? null,
    urgency: (r.urgency as string) ?? 'low',
    urgencyScore: Number(r.urgency_score) || 0,
    createdAt: r.created_at as string,
  }));
}

/** AI/heuristic recommendation for a single consultation. */
export async function suggestAssignment(
  consultationId: string,
  language: Lang = 'en'
): Promise<AssignmentSuggestion> {
  const consult = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!consult) throw new ServiceError(404, 'Consultation not found.');

  const candidates = listDoctorCandidates();
  const best = candidates.find((c) => c.availableToday) ?? candidates[0] ?? null;

  const summary = await assignmentRationale({
    urgency: (consult.urgency as string) ?? 'low',
    symptomCategory: (consult.symptom_category as string) ?? null,
    candidates: candidates.slice(0, 5).map((c) => ({
      name: c.fullName ?? 'Doctor',
      onDuty: c.onDuty,
      load: c.totalOpen,
      rating: c.avgRating,
      reasons: c.reasons,
    })),
    language,
  });

  return {
    consultationId,
    recommendedDoctorId: best?.id ?? null,
    summary,
    candidates,
  };
}

/** Assign (or reassign) a consultation to a specific doctor. */
export function assignConsultation(actorId: string, consultationId: string, doctorId: string) {
  const consult = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!consult) throw new ServiceError(404, 'Consultation not found.');

  const doctor = db.prepare('SELECT * FROM profiles WHERE id = ? AND is_doctor = 1').get(doctorId) as
    | Record<string, unknown>
    | undefined;
  if (!doctor) throw new ServiceError(404, 'Doctor not found.');

  db.prepare('UPDATE consultations SET doctor_id = ? WHERE id = ?').run(doctorId, consultationId);
  logAudit(actorId, 'assign', 'consultation', consultationId);

  createNotification({
    userId: doctorId,
    title: 'New patient assigned',
    body: `You've been assigned a ${(consult.symptom_category as string) ?? 'consultation'} case.`,
    type: 'assignment',
    consultationId,
  });
  if (consult.patient_id) {
    createNotification({
      userId: consult.patient_id as string,
      title: 'Doctor assigned',
      body: `Dr. ${(doctor.full_name as string) ?? ''} will handle your consultation.`.trim(),
      type: 'assignment',
      consultationId,
    });
  }

  const row = db
    .prepare(
      `SELECT c.*, p.full_name AS patient_name, p.phone_number AS patient_phone
       FROM consultations c LEFT JOIN profiles p ON p.id = c.patient_id WHERE c.id = ?`
    )
    .get(consultationId) as Record<string, unknown>;
  return {
    ...mapConsultation(row),
    doctorName: (doctor.full_name as string) ?? null,
  };
}

/** Let the AI pick the best on-duty doctor and assign automatically. */
export async function autoAssign(actorId: string, consultationId: string, language: Lang = 'en') {
  const suggestion = await suggestAssignment(consultationId, language);
  if (!suggestion.recommendedDoctorId) {
    throw new ServiceError(409, 'No doctor is currently available to assign.');
  }
  const consultation = assignConsultation(actorId, consultationId, suggestion.recommendedDoctorId);
  return { consultation, suggestion };
}
