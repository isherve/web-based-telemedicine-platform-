export function boolFromDb(v: number | null | undefined): boolean {
  return v === 1;
}

export function boolToDb(v: boolean): number {
  return v ? 1 : 0;
}

export function mapProfile(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    phoneNumber: (row.phone_number as string) ?? null,
    email: (row.email as string) ?? null,
    fullName: (row.full_name as string) ?? null,
    isDoctor: boolFromDb(row.is_doctor as number),
    clinicName: (row.clinic_name as string) ?? null,
    consultationFee: (row.consultation_fee as number) ?? null,
    momoNumber: (row.momo_number as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    allergies: (row.allergies as string) ?? null,
    chronicConditions: (row.chronic_conditions as string) ?? null,
    aiConsent: boolFromDb(row.ai_consent as number),
    createdAt: row.created_at as string,
  };
}

export function mapConsultation(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    patientId: (row.patient_id as string) ?? null,
    doctorId: (row.doctor_id as string) ?? null,
    status: row.status as string,
    biologicalSex: (row.biological_sex as string) ?? null,
    severity: (row.severity as string) ?? null,
    duration: (row.duration as string) ?? null,
    symptomCategory: (row.symptom_category as string) ?? null,
    symptomDescription: (row.symptom_description as string) ?? null,
    aiBriefSummary: (row.ai_brief_summary as string) ?? null,
    aiSuggestions: (row.ai_suggestions as string) ?? null,
    language: (row.language as string) ?? 'en',
    consultationFee: (row.consultation_fee as number) ?? null,
    momoTransactionId: (row.momo_transaction_id as string) ?? null,
    paymentAmount: (row.payment_amount as number) ?? null,
    paymentProvider: (row.payment_provider as string) ?? null,
    urgency: (row.urgency as string) ?? 'low',
    urgencyScore: (row.urgency_score as number) ?? 0,
    paid: boolFromDb(row.paid as number),
    closedAt: (row.closed_at as string) ?? null,
    createdAt: row.created_at as string,
    patientName: (row.patient_name as string) ?? null,
    patientPhone: (row.patient_phone as string) ?? null,
    patientAllergies: (row.patient_allergies as string) ?? null,
    patientChronic: (row.patient_chronic as string) ?? null,
  };
}
