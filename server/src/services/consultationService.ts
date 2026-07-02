import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { generateAiBrief, generateDiseaseSuggestions, scoreUrgency } from './aiService.js';
import { createNotification } from './notificationService.js';
import { emitToConsultation } from '../realtime/io.js';
import { mapConsultation } from '../utils/mappers.js';

export class ServiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

function getDoctor() {
  const row = db.prepare('SELECT * FROM profiles WHERE is_doctor = 1 LIMIT 1').get() as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ServiceError(503, 'No doctor registered on this instance.');
  return row;
}

function getConsultationRow(id: string) {
  const row = db.prepare('SELECT * FROM consultations WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ServiceError(404, 'Consultation not found.');
  return row;
}

function assertPatientAccess(consultation: Record<string, unknown>, patientId: string) {
  if (consultation.patient_id !== patientId) throw new ServiceError(403, 'Access denied.');
}

function assertDoctorAccess(consultation: Record<string, unknown>, doctorId: string) {
  if (consultation.doctor_id !== doctorId) throw new ServiceError(403, 'Access denied.');
}

export async function submitTriage(
  patientId: string,
  input: {
    biologicalSex: string;
    severity: string;
    duration: string;
    symptomCategory: string;
    symptomDescription: string;
    language: 'en' | 'rw';
  }
) {
  const doctor = getDoctor();
  const id = randomUUID();
  const now = new Date().toISOString();
  const fee = (doctor.consultation_fee as number) ?? 5000;

  let aiBrief: string;
  let aiSuggestions: string;
  try {
    // Generate brief + disease suggestions in parallel.
    [aiBrief, aiSuggestions] = await Promise.all([
      generateAiBrief(input),
      generateDiseaseSuggestions(input),
    ]);
  } catch (err) {
    throw new ServiceError(503, err instanceof Error ? err.message : 'AI generation failed.');
  }

  const urgency = scoreUrgency(input);

  db.prepare(
    `INSERT INTO consultations (
      id, patient_id, doctor_id, status, biological_sex, severity, duration,
      symptom_category, symptom_description, ai_brief_summary, ai_suggestions, language,
      consultation_fee, urgency, urgency_score, paid, created_at
    ) VALUES (?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(
    id,
    patientId,
    doctor.id,
    input.biologicalSex,
    input.severity,
    input.duration,
    input.symptomCategory,
    input.symptomDescription,
    aiBrief,
    aiSuggestions,
    input.language,
    fee,
    urgency.level,
    urgency.score,
    now
  );

  createNotification({
    userId: doctor.id as string,
    title: urgency.level === 'high' ? '🚨 Urgent consultation' : 'New consultation',
    body:
      urgency.level === 'high'
        ? `URGENT triage — ${input.symptomCategory} (${urgency.reason})`
        : `New triage submitted — ${input.symptomCategory}`,
    type: 'consultation_new',
    consultationId: id,
  });

  return mapConsultation(getConsultationRow(id));
}

export function listPatientConsultations(patientId: string) {
  const rows = db
    .prepare(
      `SELECT c.*, p.full_name AS patient_name, p.phone_number AS patient_phone
       FROM consultations c
       LEFT JOIN profiles p ON p.id = c.patient_id
       WHERE c.patient_id = ? ORDER BY c.created_at DESC`
    )
    .all(patientId) as Record<string, unknown>[];
  return rows.map(mapConsultation);
}

export function listDoctorConsultations(doctorId: string, status?: string) {
  let sql = `SELECT c.*, p.full_name AS patient_name, p.phone_number AS patient_phone,
      p.allergies AS patient_allergies, p.chronic_conditions AS patient_chronic
    FROM consultations c LEFT JOIN profiles p ON p.id = c.patient_id
    WHERE c.doctor_id = ?`;
  const params: unknown[] = [doctorId];
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  // Prioritize by urgency first, then most recent, so severe cases surface on top.
  sql += ' ORDER BY c.urgency_score DESC, c.created_at DESC';
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map(mapConsultation);
}

/** All consultations awaiting payment verification (finance view, all doctors). */
export function listPendingPayments() {
  const rows = db
    .prepare(
      `SELECT c.*, p.full_name AS patient_name, p.phone_number AS patient_phone
       FROM consultations c LEFT JOIN profiles p ON p.id = c.patient_id
       WHERE c.status = 'pending_payment' ORDER BY c.created_at DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapConsultation);
}

export function getConsultation(userId: string, isDoctor: boolean, id: string) {
  const row = getConsultationRow(id);
  if (isDoctor) assertDoctorAccess(row, userId);
  else assertPatientAccess(row, userId);
  const enriched = db
    .prepare(
      `SELECT c.*, p.full_name AS patient_name, p.phone_number AS patient_phone,
              p.allergies AS patient_allergies, p.chronic_conditions AS patient_chronic
       FROM consultations c LEFT JOIN profiles p ON p.id = c.patient_id WHERE c.id = ?`
    )
    .get(id) as Record<string, unknown>;
  if (isDoctor) logAudit(userId, 'view', 'consultation', id);
  return mapConsultation(enriched);
}

/** Lightweight audit log for record access (data-protection readiness). */
export function logAudit(actorId: string, action: string, entity: string, entityId: string) {
  try {
    db.prepare(
      'INSERT INTO audit_log (id, actor_id, action, entity, entity_id) VALUES (?, ?, ?, ?, ?)'
    ).run(randomUUID(), actorId, action, entity, entityId);
  } catch {
    // Audit logging must never break the request.
  }
}

/**
 * Patient submits a MoMo transaction ID after paying (demo flow). This does NOT
 * mark the consultation paid — it records the reference and notifies the doctor,
 * who still manually verifies it. Architected so a real MTN MoMo API / SMS
 * auto-detection could replace this submit step later without a rewrite.
 */
export function submitPayment(
  patientId: string,
  consultationId: string,
  transactionId: string,
  provider?: string
) {
  const row = getConsultationRow(consultationId);
  assertPatientAccess(row, patientId);
  if (row.paid === 1) throw new ServiceError(409, 'Payment already verified.');

  const txn = transactionId?.trim();
  if (!txn) throw new ServiceError(400, 'Transaction ID is required.');
  const prov = provider === 'airtel' ? 'airtel' : 'momo';

  db.prepare('UPDATE consultations SET momo_transaction_id = ?, payment_provider = ? WHERE id = ?').run(
    txn,
    prov,
    consultationId
  );

  const updated = mapConsultation(getConsultationRow(consultationId));
  emitToConsultation(consultationId, 'consultation:updated', updated);
  createNotification({
    userId: row.doctor_id as string,
    title: 'Payment submitted',
    body: `Patient submitted ${prov === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} transaction ID ${txn} for verification.`,
    type: 'payment_submitted',
    consultationId,
  });
  return updated;
}

/**
 * In-system payment gateway (demo). Simulates a mobile-money charge end to end:
 * validates the PIN, generates a gateway transaction reference, marks the
 * consultation paid, and opens the chat immediately — no manual verification
 * needed. Architected so a real MTN MoMo / Airtel Money API can slot in here.
 */
export function processPayment(
  patientId: string,
  consultationId: string,
  input: { provider?: string; phone?: string; pin?: string }
) {
  const row = getConsultationRow(consultationId);
  assertPatientAccess(row, patientId);
  if (row.paid === 1) throw new ServiceError(409, 'Payment already completed.');

  const provider = input.provider === 'airtel' ? 'airtel' : 'momo';
  const phone = input.phone?.trim();
  const pin = input.pin?.trim();
  if (!phone || !/^(\+?250)?0?7[0-9]{8}$/.test(phone.replace(/\s/g, ''))) {
    throw new ServiceError(400, 'Enter a valid mobile money phone number.');
  }
  if (!pin || !/^\d{4,5}$/.test(pin)) {
    throw new ServiceError(400, 'Enter your 4-5 digit mobile money PIN.');
  }

  // Simulate gateway: generate a provider-style transaction reference.
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  const digits = Math.floor(1000000000 + Math.random() * 8999999999);
  const txn = `${provider === 'airtel' ? 'AM' : 'MP'}${digits}.${ref}`;
  const fee = (row.consultation_fee as number) ?? 5000;

  db.prepare(
    `UPDATE consultations SET paid = 1, momo_transaction_id = ?, payment_provider = ?,
     payment_amount = ?, status = 'in_process' WHERE id = ?`
  ).run(txn, provider, fee, consultationId);

  const updated = mapConsultation(getConsultationRow(consultationId));
  emitToConsultation(consultationId, 'consultation:updated', updated);
  createNotification({
    userId: row.doctor_id as string,
    title: 'Payment received',
    body: `${provider === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} payment of ${fee.toLocaleString()} RWF received (${txn}). Chat is open.`,
    type: 'payment_verified',
    consultationId,
  });
  createNotification({
    userId: patientId,
    title: 'Payment successful',
    body: `You paid ${fee.toLocaleString()} RWF via ${provider === 'airtel' ? 'Airtel Money' : 'MTN MoMo'}. Your consultation is now active.`,
    type: 'payment_verified',
    consultationId,
  });
  logAudit(patientId, 'pay', 'consultation', consultationId);
  return { consultation: updated, transactionId: txn, amount: fee };
}

/**
 * Verify MoMo transaction ID — idempotent guard against double-verification.
 * Doctor (owner) or finance staff may verify. Finance bypasses the ownership
 * check since they handle payments across the clinic.
 */
export function verifyPayment(
  actorId: string,
  consultationId: string,
  transactionId: string,
  opts: { bypassOwnership?: boolean } = {}
) {
  const row = getConsultationRow(consultationId);
  if (!opts.bypassOwnership) assertDoctorAccess(row, actorId);

  if (row.paid === 1) {
    throw new ServiceError(409, 'Payment already verified for this consultation.');
  }
  const txn = transactionId?.trim();
  if (!txn) throw new ServiceError(400, 'Transaction ID is required.');

  const duplicate = db
    .prepare(
      `SELECT id FROM consultations WHERE momo_transaction_id = ? AND id != ? AND paid = 1`
    )
    .get(txn, consultationId);
  if (duplicate) throw new ServiceError(409, 'This transaction ID was already used.');

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE consultations SET paid = 1, momo_transaction_id = ?, payment_amount = consultation_fee,
     status = 'in_process' WHERE id = ?`
  ).run(txn, consultationId);

  const updated = mapConsultation(getConsultationRow(consultationId));
  emitToConsultation(consultationId, 'consultation:updated', updated);
  createNotification({
    userId: row.patient_id as string,
    title: 'Payment confirmed',
    body: 'Your payment was verified. Chat is now open.',
    type: 'payment_verified',
    consultationId,
  });
  return updated;
}

export function markComplete(doctorId: string, consultationId: string) {
  const row = getConsultationRow(consultationId);
  assertDoctorAccess(row, doctorId);
  if (row.status !== 'in_process') {
    throw new ServiceError(400, 'Only in-process consultations can be completed.');
  }
  const now = new Date().toISOString();
  db.prepare(`UPDATE consultations SET status = 'complete', closed_at = ? WHERE id = ?`).run(
    now,
    consultationId
  );
  const updated = mapConsultation(getConsultationRow(consultationId));
  emitToConsultation(consultationId, 'consultation:updated', updated);
  createNotification({
    userId: row.patient_id as string,
    title: 'Consultation complete',
    body: 'Your consultation is complete. Please rate your experience.',
    type: 'consultation_complete',
    consultationId,
  });
  return updated;
}

export function getDoctorStats(doctorId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const todayIncome = db
    .prepare(
      `SELECT COALESCE(SUM(payment_amount), 0) AS total FROM consultations
       WHERE doctor_id = ? AND paid = 1 AND date(created_at) = date(?)`
    )
    .get(doctorId, today) as { total: number };

  const monthIncome = db
    .prepare(
      `SELECT COALESCE(SUM(payment_amount), 0) AS total FROM consultations
       WHERE doctor_id = ? AND paid = 1 AND date(created_at) >= date(?)`
    )
    .get(doctorId, monthStart) as { total: number };

  const confirmedPatients = db
    .prepare(
      `SELECT COUNT(DISTINCT patient_id) AS c FROM consultations WHERE doctor_id = ? AND paid = 1`
    )
    .get(doctorId) as { c: number };

  return {
    todayIncome: todayIncome.total,
    monthIncome: monthIncome.total,
    confirmedPatients: confirmedPatients.c,
  };
}

export function updateDoctorProfile(
  doctorId: string,
  input: { consultationFee?: number; momoNumber?: string; clinicName?: string }
) {
  if (input.consultationFee != null) {
    db.prepare('UPDATE profiles SET consultation_fee = ? WHERE id = ?').run(
      input.consultationFee,
      doctorId
    );
  }
  if (input.momoNumber != null) {
    db.prepare('UPDATE profiles SET momo_number = ? WHERE id = ?').run(input.momoNumber, doctorId);
  }
  if (input.clinicName != null) {
    db.prepare('UPDATE profiles SET clinic_name = ? WHERE id = ?').run(input.clinicName, doctorId);
  }
}

/** Full longitudinal history for one patient (doctor view of a returning patient). */
export function getPatientHistory(doctorId: string, patientId: string) {
  // Only allow if the doctor has treated this patient before.
  const seen = db
    .prepare('SELECT 1 FROM consultations WHERE doctor_id = ? AND patient_id = ? LIMIT 1')
    .get(doctorId, patientId);
  if (!seen) throw new ServiceError(403, 'No relationship with this patient.');

  const profile = db
    .prepare(
      'SELECT id, full_name, phone_number, allergies, chronic_conditions FROM profiles WHERE id = ?'
    )
    .get(patientId) as Record<string, unknown> | undefined;
  if (!profile) throw new ServiceError(404, 'Patient not found.');

  const consultations = db
    .prepare(
      `SELECT id, status, symptom_category, symptom_description, severity, ai_brief_summary,
              urgency, created_at, closed_at
       FROM consultations WHERE patient_id = ? AND doctor_id = ? ORDER BY created_at DESC`
    )
    .all(patientId, doctorId) as Record<string, unknown>[];

  const documents = db
    .prepare(
      `SELECT id, document_kind, created_at FROM clinical_documents
       WHERE patient_id = ? ORDER BY created_at DESC`
    )
    .all(patientId) as Record<string, unknown>[];

  const dispenses = db
    .prepare(
      `SELECT d.quantity, d.created_at, m.name AS medicine_name FROM dispenses d
       LEFT JOIN medicines m ON m.id = d.medicine_id
       WHERE d.patient_id = ? ORDER BY d.created_at DESC`
    )
    .all(patientId) as Record<string, unknown>[];

  logAudit(doctorId, 'view_history', 'patient', patientId);

  return {
    patient: {
      id: profile.id,
      fullName: profile.full_name,
      phoneNumber: profile.phone_number,
      allergies: profile.allergies ?? null,
      chronicConditions: profile.chronic_conditions ?? null,
    },
    consultations: consultations.map((c) => ({
      id: c.id,
      status: c.status,
      symptomCategory: c.symptom_category,
      symptomDescription: c.symptom_description,
      severity: c.severity,
      aiBriefSummary: c.ai_brief_summary,
      urgency: c.urgency,
      createdAt: c.created_at,
      closedAt: c.closed_at,
    })),
    documents: documents.map((d) => ({
      id: d.id,
      documentKind: d.document_kind,
      createdAt: d.created_at,
    })),
    dispenses: dispenses.map((d) => ({
      medicineName: d.medicine_name,
      quantity: d.quantity,
      createdAt: d.created_at,
    })),
  };
}

/** Aggregate analytics for the doctor dashboard. */
export function getDoctorAnalytics(doctorId: string) {
  const byCategory = db
    .prepare(
      `SELECT COALESCE(symptom_category,'Other') AS category, COUNT(*) AS count
       FROM consultations WHERE doctor_id = ?
       GROUP BY symptom_category ORDER BY count DESC LIMIT 8`
    )
    .all(doctorId) as { category: string; count: number }[];

  const byWeek = db
    .prepare(
      `SELECT strftime('%Y-%W', created_at) AS week, COUNT(*) AS count
       FROM consultations WHERE doctor_id = ?
       GROUP BY week ORDER BY week DESC LIMIT 8`
    )
    .all(doctorId) as { week: string; count: number }[];

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='complete' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN urgency='high' THEN 1 ELSE 0 END) AS urgent
       FROM consultations WHERE doctor_id = ?`
    )
    .get(doctorId) as { total: number; completed: number; urgent: number };

  const patientCounts = db
    .prepare(
      `SELECT patient_id, COUNT(*) AS visits FROM consultations WHERE doctor_id = ? GROUP BY patient_id`
    )
    .all(doctorId) as { patient_id: string; visits: number }[];
  const uniquePatients = patientCounts.length;
  const repeatPatients = patientCounts.filter((p) => p.visits > 1).length;
  const repeatRate = uniquePatients ? Math.round((repeatPatients / uniquePatients) * 100) : 0;

  const rating = db
    .prepare(
      `SELECT COALESCE(AVG(stars),0) AS avg, COUNT(*) AS count FROM ratings WHERE doctor_id = ?`
    )
    .get(doctorId) as { avg: number; count: number };

  return {
    byCategory,
    byWeek: byWeek.reverse(),
    totalConsultations: totals.total ?? 0,
    completed: totals.completed ?? 0,
    urgentCount: totals.urgent ?? 0,
    uniquePatients,
    repeatRate,
    avgRating: Math.round((rating.avg ?? 0) * 10) / 10,
    ratingCount: rating.count ?? 0,
  };
}

/** Patient updates their own clinical flags. */
export function updatePatientProfile(
  patientId: string,
  input: { allergies?: string; chronicConditions?: string; aiConsent?: boolean }
) {
  if (input.allergies !== undefined) {
    db.prepare('UPDATE profiles SET allergies = ? WHERE id = ?').run(
      input.allergies?.trim() || null,
      patientId
    );
  }
  if (input.chronicConditions !== undefined) {
    db.prepare('UPDATE profiles SET chronic_conditions = ? WHERE id = ?').run(
      input.chronicConditions?.trim() || null,
      patientId
    );
  }
  if (input.aiConsent !== undefined) {
    db.prepare('UPDATE profiles SET ai_consent = ?, consented_at = ? WHERE id = ?').run(
      input.aiConsent ? 1 : 0,
      input.aiConsent ? new Date().toISOString() : null,
      patientId
    );
  }
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(patientId) as Record<string, unknown>;
}

/** All of a patient's own data, for self-service export (data portability). */
export function getMyData(patientId: string) {
  const profile = db
    .prepare(
      'SELECT id, full_name, phone_number, allergies, chronic_conditions, created_at FROM profiles WHERE id = ?'
    )
    .get(patientId) as Record<string, unknown>;
  const consultations = db
    .prepare('SELECT * FROM consultations WHERE patient_id = ? ORDER BY created_at DESC')
    .all(patientId) as Record<string, unknown>[];
  const documents = db
    .prepare('SELECT id, document_kind, created_at FROM clinical_documents WHERE patient_id = ? ORDER BY created_at DESC')
    .all(patientId) as Record<string, unknown>[];
  const dispenses = db
    .prepare(
      `SELECT d.quantity, d.created_at, m.name AS medicine_name FROM dispenses d
       LEFT JOIN medicines m ON m.id = d.medicine_id WHERE d.patient_id = ? ORDER BY d.created_at DESC`
    )
    .all(patientId) as Record<string, unknown>[];
  return {
    patient: {
      id: profile.id,
      fullName: profile.full_name,
      phoneNumber: profile.phone_number,
      allergies: profile.allergies ?? null,
      chronicConditions: profile.chronic_conditions ?? null,
      memberSince: profile.created_at,
    },
    consultations: consultations.map(mapConsultation),
    documents: documents.map((d) => ({ id: d.id, documentKind: d.document_kind, createdAt: d.created_at })),
    dispenses: dispenses.map((d) => ({ medicineName: d.medicine_name, quantity: d.quantity, createdAt: d.created_at })),
  };
}

/**
 * Patient's position in the doctor's pending queue (waiting-room indicator).
 * Queue is ordered by urgency then arrival, matching the doctor's view.
 */
export function getQueuePosition(patientId: string, consultationId: string) {
  const row = getConsultationRow(consultationId);
  assertPatientAccess(row, patientId);
  if (row.status === 'complete') return { position: 0, total: 0 };

  const queue = db
    .prepare(
      `SELECT id FROM consultations
       WHERE doctor_id = ? AND status IN ('pending_payment','in_process')
       ORDER BY urgency_score DESC, created_at ASC`
    )
    .all(row.doctor_id) as { id: string }[];
  const idx = queue.findIndex((q) => q.id === consultationId);
  return { position: idx >= 0 ? idx + 1 : 0, total: queue.length };
}

export function listRegularPatients(doctorId: string) {
  const rows = db
    .prepare(
      `SELECT p.id, p.full_name, p.phone_number, COUNT(c.id) AS visit_count,
              MAX(c.created_at) AS last_visit
       FROM consultations c JOIN profiles p ON p.id = c.patient_id
       WHERE c.doctor_id = ? AND c.paid = 1
       GROUP BY p.id ORDER BY last_visit DESC`
    )
    .all(doctorId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    visitCount: r.visit_count,
    lastVisit: r.last_visit,
  }));
}
