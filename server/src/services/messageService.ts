import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { emitToConsultation } from '../realtime/io.js';
import { ServiceError } from './consultationService.js';

export function listMessages(userId: string, isDoctor: boolean, consultationId: string) {
  const c = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!c) throw new ServiceError(404, 'Consultation not found.');
  if (isDoctor && c.doctor_id !== userId) throw new ServiceError(403, 'Access denied.');
  if (!isDoctor && c.patient_id !== userId) throw new ServiceError(403, 'Access denied.');
  if (c.status !== 'in_process' && !isDoctor) {
    throw new ServiceError(403, 'Chat is locked until payment is verified.');
  }

  const rows = db
    .prepare('SELECT * FROM messages WHERE consultation_id = ? ORDER BY created_at ASC')
    .all(consultationId) as Record<string, unknown>[];
  return rows.map(mapMessage);
}

export function sendMessage(
  senderId: string,
  isDoctor: boolean,
  consultationId: string,
  input: { messageType: 'text' | 'photo' | 'voice'; content: string }
) {
  const c = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!c) throw new ServiceError(404, 'Consultation not found.');
  if (c.status !== 'in_process') throw new ServiceError(403, 'Chat is only available during consultation.');
  if (isDoctor && c.doctor_id !== senderId) throw new ServiceError(403, 'Access denied.');
  if (!isDoctor && c.patient_id !== senderId) throw new ServiceError(403, 'Access denied.');

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, consultation_id, sender_id, message_type, content, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, consultationId, senderId, input.messageType, input.content, now);

  const msg = mapMessage(
    db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Record<string, unknown>
  );
  emitToConsultation(consultationId, 'message:new', msg);
  return msg;
}

function mapMessage(r: Record<string, unknown>) {
  return {
    id: r.id,
    consultationId: r.consultation_id,
    senderId: r.sender_id,
    messageType: r.message_type,
    content: r.content,
    createdAt: r.created_at,
  };
}
