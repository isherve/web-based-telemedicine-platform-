import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';
import { createNotification } from './notificationService.js';

function mapReminder(r: Record<string, unknown>) {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    body: r.body,
    kind: r.kind,
    dueAt: r.due_at,
    sent: r.sent === 1,
    createdAt: r.created_at,
  };
}

export function createReminder(
  userId: string,
  input: { title: string; body?: string; kind?: string; dueAt: string }
) {
  if (!input.title?.trim()) throw new ServiceError(400, 'Title is required.');
  if (!input.dueAt || Number.isNaN(new Date(input.dueAt).getTime())) {
    throw new ServiceError(400, 'A valid due date/time is required.');
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO reminders (id, user_id, title, body, kind, due_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.title.trim(),
    input.body?.trim() || null,
    input.kind?.trim() || 'medication',
    new Date(input.dueAt).toISOString()
  );
  return mapReminder(db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as Record<string, unknown>);
}

export function listReminders(userId: string) {
  const rows = db
    .prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at ASC')
    .all(userId) as Record<string, unknown>[];
  return rows.map(mapReminder);
}

export function deleteReminder(userId: string, id: string) {
  const row = db.prepare('SELECT * FROM reminders WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ServiceError(404, 'Reminder not found.');
  if (row.user_id !== userId) throw new ServiceError(403, 'Access denied.');
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
}

/** Fires any due reminders as in-app notifications (called by the sweep job). */
export function fireDueReminders() {
  const now = new Date().toISOString();
  const due = db
    .prepare('SELECT * FROM reminders WHERE sent = 0 AND due_at <= ?')
    .all(now) as Record<string, unknown>[];
  for (const r of due) {
    createNotification({
      userId: r.user_id as string,
      title: (r.title as string) || 'Reminder',
      body: (r.body as string) || 'You have a reminder.',
      type: `reminder_${r.kind}`,
    });
    db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(r.id as string);
  }
  return due.length;
}
