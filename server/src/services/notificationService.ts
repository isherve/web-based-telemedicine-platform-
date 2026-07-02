import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { emitToUser } from '../realtime/io.js';

export function createNotification(input: {
  userId: string;
  title: string;
  body: string;
  type: string;
  consultationId?: string;
}): void {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, type, consultation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.title, input.body, input.type, input.consultationId ?? null, now);

  emitToUser(input.userId, 'notification:new', {
    id,
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type,
    consultationId: input.consultationId ?? null,
    isRead: false,
    createdAt: now,
  });
}

export function listNotifications(userId: string) {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    body: r.body,
    type: r.type,
    isRead: r.is_read === 1,
    consultationId: r.consultation_id,
    createdAt: r.created_at,
  }));
}

export function markRead(userId: string, id: string): void {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
}
