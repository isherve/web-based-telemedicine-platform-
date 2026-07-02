import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { createNotification } from './notificationService.js';
import { ServiceError } from './consultationService.js';

export function listDocuments(userId: string, isDoctor: boolean) {
  if (isDoctor) {
    const rows = db
      .prepare(
        `SELECT d.*, p.full_name AS patient_name FROM clinical_documents d
         LEFT JOIN profiles p ON p.id = d.patient_id ORDER BY d.created_at DESC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(mapDoc);
  }
  const rows = db
    .prepare('SELECT * FROM clinical_documents WHERE patient_id = ? ORDER BY created_at DESC')
    .all(userId) as Record<string, unknown>[];
  return rows.map(mapDoc);
}

export function createDocument(
  doctorId: string,
  consultationId: string,
  input: { documentKind: 'prescription' | 'transfer'; pdfStorageUrl: string }
) {
  const c = db.prepare('SELECT * FROM consultations WHERE id = ?').get(consultationId) as
    | Record<string, unknown>
    | undefined;
  if (!c) throw new ServiceError(404, 'Consultation not found.');
  if (c.doctor_id !== doctorId) throw new ServiceError(403, 'Access denied.');
  if (c.status !== 'in_process') throw new ServiceError(400, 'Documents can only be created during consultation.');

  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO clinical_documents (id, consultation_id, patient_id, document_kind, pdf_storage_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, consultationId, c.patient_id, input.documentKind, input.pdfStorageUrl, now);

  createNotification({
    userId: c.patient_id as string,
    title: input.documentKind === 'prescription' ? 'New prescription' : 'New transfer slip',
    body: 'A new document is available in your Documents tab.',
    type: 'document_new',
    consultationId,
  });

  return mapDoc(
    db.prepare('SELECT * FROM clinical_documents WHERE id = ?').get(id) as Record<string, unknown>
  );
}

function mapDoc(r: Record<string, unknown>) {
  return {
    id: r.id,
    consultationId: r.consultation_id,
    patientId: r.patient_id,
    documentKind: r.document_kind,
    pdfStorageUrl: r.pdf_storage_url,
    createdAt: r.created_at,
    patientName: r.patient_name ?? null,
  };
}
