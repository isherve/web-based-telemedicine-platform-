import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';

export function getDoctorSchedule(doctorId: string) {
  const rows = db
    .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week')
    .all(doctorId) as Record<string, unknown>[];
  return rows.map(mapSchedule);
}

export function getPublicSchedule() {
  const doctor = db.prepare('SELECT id FROM profiles WHERE is_doctor = 1 LIMIT 1').get() as
    | { id: string }
    | undefined;
  if (!doctor) return [];
  return getDoctorSchedule(doctor.id);
}

export function saveSchedule(
  doctorId: string,
  slots: {
    dayOfWeek: number;
    openTime: string | null;
    closeTime: string | null;
    isAvailable: boolean;
    slotDurationMinutes: number;
  }[]
) {
  db.prepare('DELETE FROM doctor_schedules WHERE doctor_id = ?').run(doctorId);
  const insert = db.prepare(
    `INSERT INTO doctor_schedules (id, doctor_id, day_of_week, open_time, close_time, is_available, slot_duration_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const s of slots) {
    insert.run(
      randomUUID(),
      doctorId,
      s.dayOfWeek,
      s.openTime,
      s.closeTime,
      s.isAvailable ? 1 : 0,
      s.slotDurationMinutes
    );
  }
  return getDoctorSchedule(doctorId);
}

export function getAvailableDates(doctorId: string, days = 14): string[] {
  const schedule = getDoctorSchedule(doctorId);
  const availableDays = new Set(schedule.filter((s) => s.isAvailable).map((s) => s.dayOfWeek));
  const dates: string[] = [];
  const now = new Date();
  for (let i = 1; i <= days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dow = d.getDay() === 0 ? 7 : d.getDay(); // Mon=1..Sun=7
    if (availableDays.has(dow)) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function mapSchedule(r: Record<string, unknown>) {
  return {
    id: r.id,
    doctorId: r.doctor_id,
    dayOfWeek: r.day_of_week,
    openTime: r.open_time,
    closeTime: r.close_time,
    isAvailable: r.is_available === 1,
    slotDurationMinutes: r.slot_duration_minutes,
  };
}
