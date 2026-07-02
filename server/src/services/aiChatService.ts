import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';
import {
  doctorReplySuggestions,
  generalAssistant,
  patientAssistant,
  triageChatbot,
  type ChatTurn,
  type TriageChatDraft,
} from './aiService.js';
import { roleOf, type ProfileRow } from './authService.js';

function getConsultationRow(id: string) {
  const row = db.prepare('SELECT * FROM consultations WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new ServiceError(404, 'Consultation not found.');
  return row;
}

function assertPatientAccess(row: Record<string, unknown>, patientId: string) {
  if (row.patient_id !== patientId) throw new ServiceError(403, 'Access denied.');
}

function assertDoctorAccess(row: Record<string, unknown>, doctorId: string) {
  if (row.doctor_id !== doctorId) throw new ServiceError(403, 'Access denied.');
}

export function runTriageChat(
  messages: ChatTurn[],
  draft: TriageChatDraft,
  language: 'en' | 'rw'
) {
  return triageChatbot(messages, draft, language);
}

export async function runPatientAssistant(
  patientId: string,
  consultationId: string,
  messages: ChatTurn[],
  question: string,
  language: 'en' | 'rw'
) {
  const row = getConsultationRow(consultationId);
  assertPatientAccess(row, patientId);
  if (row.status !== 'in_process') {
    throw new ServiceError(403, 'AI assistant is available during active consultations.');
  }

  const profile = db
    .prepare('SELECT allergies, chronic_conditions FROM profiles WHERE id = ?')
    .get(patientId) as { allergies: string | null; chronic_conditions: string | null } | undefined;

  return patientAssistant(
    {
      symptomCategory: (row.symptom_category as string) ?? null,
      symptomDescription: (row.symptom_description as string) ?? null,
      severity: (row.severity as string) ?? null,
      aiSuggestions: (row.ai_suggestions as string) ?? null,
      allergies: profile?.allergies ?? null,
      chronicConditions: profile?.chronic_conditions ?? null,
    },
    messages,
    question,
    language
  );
}

export async function runDoctorSuggestions(
  doctorId: string,
  consultationId: string,
  language: 'en' | 'rw'
) {
  const row = getConsultationRow(consultationId);
  assertDoctorAccess(row, doctorId);
  if (row.status !== 'in_process') {
    throw new ServiceError(403, 'Suggestions are available during active consultations.');
  }

  const patient = db
    .prepare('SELECT full_name, allergies, chronic_conditions FROM profiles WHERE id = ?')
    .get(row.patient_id as string) as
    | { full_name: string | null; allergies: string | null; chronic_conditions: string | null }
    | undefined;

  const msgRows = db
    .prepare(
      `SELECT m.content, m.sender_id, m.message_type FROM messages m
       WHERE m.consultation_id = ? AND m.message_type = 'text'
       ORDER BY m.created_at DESC LIMIT 12`
    )
    .all(consultationId) as { content: string; sender_id: string; message_type: string }[];

  const chatMessages = msgRows.reverse().map((m) => ({
    senderIsDoctor: m.sender_id === doctorId,
    content: m.content,
  }));

  return doctorReplySuggestions(
    {
      symptomCategory: (row.symptom_category as string) ?? null,
      symptomDescription: (row.symptom_description as string) ?? null,
      severity: (row.severity as string) ?? null,
      aiBriefSummary: (row.ai_brief_summary as string) ?? null,
      patientName: patient?.full_name ?? null,
      patientAllergies: patient?.allergies ?? null,
      patientChronic: patient?.chronic_conditions ?? null,
    },
    chatMessages,
    language
  );
}

export async function runGeneralAssistant(
  profile: ProfileRow,
  page: string,
  messages: ChatTurn[],
  question: string,
  language: 'en' | 'rw'
) {
  const role = roleOf(profile);
  return generalAssistant(role, profile.full_name, page, messages, question, language);
}
