import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';
import { roleOf, type ProfileRow, type Role } from './authService.js';

const count = (sql: string, ...args: unknown[]) =>
  (db.prepare(sql).get(...args) as { c: number }).c;

/** System-wide KPIs for the admin dashboard. */
export function systemStats() {
  const revenueRow = db
    .prepare('SELECT COALESCE(SUM(payment_amount),0) AS total FROM consultations WHERE paid = 1')
    .get() as { total: number };
  return {
    users: {
      total: count('SELECT COUNT(*) AS c FROM profiles'),
      patients: count("SELECT COUNT(*) AS c FROM profiles WHERE role = 'patient'"),
      doctors: count('SELECT COUNT(*) AS c FROM profiles WHERE is_doctor = 1'),
      finance: count("SELECT COUNT(*) AS c FROM profiles WHERE role = 'finance'"),
      pharmacy: count("SELECT COUNT(*) AS c FROM profiles WHERE role = 'pharmacy'"),
    },
    consultations: {
      total: count('SELECT COUNT(*) AS c FROM consultations'),
      pending: count("SELECT COUNT(*) AS c FROM consultations WHERE status = 'pending_payment'"),
      inProgress: count("SELECT COUNT(*) AS c FROM consultations WHERE status = 'in_process'"),
      completed: count("SELECT COUNT(*) AS c FROM consultations WHERE status = 'complete'"),
      urgent: count("SELECT COUNT(*) AS c FROM consultations WHERE urgency = 'high'"),
    },
    revenue: revenueRow.total,
    prescriptions: count('SELECT COUNT(*) AS c FROM prescriptions'),
    labOrders: count('SELECT COUNT(*) AS c FROM lab_orders'),
    medicines: count('SELECT COUNT(*) AS c FROM medicines'),
    lowStock: count('SELECT COUNT(*) AS c FROM medicines WHERE quantity <= reorder_level'),
  };
}

export function listUsers(role?: string) {
  const rows = (
    role
      ? db.prepare('SELECT * FROM profiles WHERE role = ? ORDER BY created_at DESC').all(role)
      : db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all()
  ) as ProfileRow[];
  return rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phoneNumber: r.phone_number,
    role: roleOf(r),
    isDoctor: r.is_doctor === 1,
    clinicName: r.clinic_name,
    createdAt: r.created_at,
  }));
}

/** Admin can change a user's role (e.g. promote a doctor, add finance staff). */
export function setUserRole(actorId: string, userId: string, role: Role) {
  if (!['patient', 'doctor', 'finance', 'pharmacy', 'admin'].includes(role)) {
    throw new ServiceError(400, 'Invalid role.');
  }
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId) as
    | ProfileRow
    | undefined;
  if (!row) throw new ServiceError(404, 'User not found.');
  const isDoctor = role === 'doctor' ? 1 : 0;
  db.prepare('UPDATE profiles SET role = ?, is_doctor = ? WHERE id = ?').run(role, isDoctor, userId);
  db.prepare(
    `INSERT INTO audit_log (id, actor_id, action, entity, entity_id)
     VALUES (lower(hex(randomblob(16))), ?, ?, 'profile', ?)`
  ).run(actorId, `set_role:${role}`, userId);
  return listUsers().find((u) => u.id === userId);
}

/** Per-doctor performance for a multi-doctor deployment. */
export function doctorLeaderboard() {
  const rows = db
    .prepare(
      `SELECT d.id, d.full_name AS name,
              COUNT(c.id) AS consultations,
              SUM(CASE WHEN c.status = 'complete' THEN 1 ELSE 0 END) AS completed,
              COALESCE(SUM(CASE WHEN c.paid = 1 THEN c.payment_amount ELSE 0 END),0) AS revenue,
              (SELECT ROUND(AVG(r.stars),2) FROM ratings r WHERE r.doctor_id = d.id) AS avg_rating
       FROM profiles d
       LEFT JOIN consultations c ON c.doctor_id = d.id
       WHERE d.is_doctor = 1
       GROUP BY d.id ORDER BY consultations DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    consultations: r.consultations,
    completed: r.completed,
    revenue: r.revenue,
    avgRating: r.avg_rating,
  }));
}

export function recentAudit(limit = 50) {
  const rows = db
    .prepare(
      `SELECT a.*, p.full_name AS actor_name FROM audit_log a
       LEFT JOIN profiles p ON p.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    createdAt: r.created_at,
  }));
}
