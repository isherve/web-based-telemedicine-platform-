import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { ServiceError } from './consultationService.js';
import { createNotification } from './notificationService.js';

// Simple rule-based interaction pairs (name keyword A + keyword B => warning).
const INTERACTION_RULES: { a: string; b: string; note: string }[] = [
  { a: 'ibuprofen', b: 'aspirin', note: 'NSAID + aspirin: increased GI bleeding risk.' },
  { a: 'ibuprofen', b: 'warfarin', note: 'NSAID + anticoagulant: bleeding risk.' },
  { a: 'amoxicillin', b: 'methotrexate', note: 'May raise methotrexate toxicity.' },
  { a: 'paracetamol', b: 'warfarin', note: 'High-dose paracetamol may potentiate warfarin.' },
  { a: 'ciprofloxacin', b: 'ibuprofen', note: 'May increase seizure risk.' },
];

/**
 * Rule-based safety check before dispensing: patient allergy match + interactions
 * with medicines dispensed to the same patient in the last 14 days. Non-blocking
 * (returns warnings; the pharmacist decides). Not a substitute for clinical review.
 */
export function checkSafety(patientId: string | undefined, medicineName: string): string[] {
  const warnings: string[] = [];
  const name = medicineName.toLowerCase();
  if (!patientId) return warnings;

  const patient = db.prepare('SELECT allergies FROM profiles WHERE id = ?').get(patientId) as
    | { allergies: string | null }
    | undefined;
  const allergies = (patient?.allergies ?? '')
    .toLowerCase()
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const a of allergies) {
    if (a && (name.includes(a) || a.includes(name.split(' ')[0]))) {
      warnings.push(`⚠ ALLERGY: patient is allergic to "${a}".`);
    }
  }

  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const recent = db
    .prepare(
      `SELECT m.name FROM dispenses d LEFT JOIN medicines m ON m.id = d.medicine_id
       WHERE d.patient_id = ? AND d.created_at >= ?`
    )
    .all(patientId, since) as { name: string }[];
  for (const r of recent) {
    const other = (r.name ?? '').toLowerCase();
    for (const rule of INTERACTION_RULES) {
      const hit =
        (name.includes(rule.a) && other.includes(rule.b)) ||
        (name.includes(rule.b) && other.includes(rule.a));
      if (hit) warnings.push(`⚠ INTERACTION with recent ${r.name}: ${rule.note}`);
    }
  }
  return [...new Set(warnings)];
}

function mapMedicine(r: Record<string, unknown>) {
  return {
    id: r.id,
    name: r.name,
    form: r.form,
    quantity: r.quantity,
    reorderLevel: r.reorder_level,
    unitPrice: r.unit_price,
    createdAt: r.created_at,
    low: (r.quantity as number) <= (r.reorder_level as number),
  };
}

export function listMedicines() {
  const rows = db.prepare('SELECT * FROM medicines ORDER BY name').all() as Record<string, unknown>[];
  return rows.map(mapMedicine);
}

export function addMedicine(input: {
  name: string;
  form?: string;
  quantity?: number;
  reorderLevel?: number;
  unitPrice?: number;
}) {
  const name = input.name?.trim();
  if (!name) throw new ServiceError(400, 'Medicine name is required.');
  const id = randomUUID();
  db.prepare(
    `INSERT INTO medicines (id, name, form, quantity, reorder_level, unit_price)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    input.form?.trim() ?? null,
    Math.max(0, input.quantity ?? 0),
    Math.max(0, input.reorderLevel ?? 10),
    Math.max(0, input.unitPrice ?? 0)
  );
  return mapMedicine(db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as Record<string, unknown>);
}

export function updateMedicine(
  id: string,
  input: { name?: string; form?: string; quantity?: number; reorderLevel?: number; unitPrice?: number }
) {
  const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id);
  if (!existing) throw new ServiceError(404, 'Medicine not found.');
  if (input.name != null) db.prepare('UPDATE medicines SET name = ? WHERE id = ?').run(input.name.trim(), id);
  if (input.form != null) db.prepare('UPDATE medicines SET form = ? WHERE id = ?').run(input.form.trim(), id);
  if (input.quantity != null)
    db.prepare('UPDATE medicines SET quantity = ? WHERE id = ?').run(Math.max(0, input.quantity), id);
  if (input.reorderLevel != null)
    db.prepare('UPDATE medicines SET reorder_level = ? WHERE id = ?').run(Math.max(0, input.reorderLevel), id);
  if (input.unitPrice != null)
    db.prepare('UPDATE medicines SET unit_price = ? WHERE id = ?').run(Math.max(0, input.unitPrice), id);
  return mapMedicine(db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as Record<string, unknown>);
}

/** Add stock (restock) — increments quantity. */
export function restockMedicine(id: string, amount: number) {
  if (amount <= 0) throw new ServiceError(400, 'Restock amount must be positive.');
  const existing = db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) throw new ServiceError(404, 'Medicine not found.');
  db.prepare('UPDATE medicines SET quantity = quantity + ? WHERE id = ?').run(amount, id);
  return mapMedicine(db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as Record<string, unknown>);
}

/** Dispense a medicine to a patient — deducts stock, records a dispense row. */
export function dispenseMedicine(
  dispensedBy: string,
  input: { medicineId: string; quantity: number; patientId?: string; consultationId?: string; note?: string }
) {
  const med = db.prepare('SELECT * FROM medicines WHERE id = ?').get(input.medicineId) as
    | Record<string, unknown>
    | undefined;
  if (!med) throw new ServiceError(404, 'Medicine not found.');
  const qty = Math.floor(input.quantity);
  if (!qty || qty <= 0) throw new ServiceError(400, 'Quantity must be a positive number.');
  if ((med.quantity as number) < qty) {
    throw new ServiceError(409, `Not enough stock. Only ${med.quantity} left.`);
  }

  const id = randomUUID();
  const tx = db.transaction(() => {
    db.prepare('UPDATE medicines SET quantity = quantity - ? WHERE id = ?').run(qty, input.medicineId);
    db.prepare(
      `INSERT INTO dispenses (id, medicine_id, consultation_id, patient_id, dispensed_by, quantity, unit_price, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.medicineId,
      input.consultationId ?? null,
      input.patientId ?? null,
      dispensedBy,
      qty,
      med.unit_price as number,
      input.note?.trim() ?? null
    );
  });
  tx();

  if (input.patientId) {
    createNotification({
      userId: input.patientId,
      title: 'Medicine dispensed',
      body: `${med.name} x${qty} was dispensed to you.`,
      type: 'dispense',
      consultationId: input.consultationId,
    });
  }

  return {
    dispense: mapDispense(db.prepare('SELECT * FROM dispenses WHERE id = ?').get(id) as Record<string, unknown>),
    medicine: mapMedicine(db.prepare('SELECT * FROM medicines WHERE id = ?').get(input.medicineId) as Record<string, unknown>),
    warnings: checkSafety(input.patientId, med.name as string),
  };
}

function mapDispense(r: Record<string, unknown>) {
  return {
    id: r.id,
    medicineId: r.medicine_id,
    consultationId: r.consultation_id,
    patientId: r.patient_id,
    dispensedBy: r.dispensed_by,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    note: r.note,
    createdAt: r.created_at,
    medicineName: r.medicine_name ?? null,
    patientName: r.patient_name ?? null,
  };
}

export function listDispenses(limit = 100) {
  const rows = db
    .prepare(
      `SELECT d.*, m.name AS medicine_name, p.full_name AS patient_name
       FROM dispenses d
       LEFT JOIN medicines m ON m.id = d.medicine_id
       LEFT JOIN profiles p ON p.id = d.patient_id
       ORDER BY d.created_at DESC LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapDispense);
}

/** Prescriptions awaiting dispensing (from clinical_documents), for the queue. */
export function listPrescriptions() {
  const rows = db
    .prepare(
      `SELECT cd.id, cd.consultation_id, cd.patient_id, cd.created_at,
              p.full_name AS patient_name
       FROM clinical_documents cd
       LEFT JOIN profiles p ON p.id = cd.patient_id
       WHERE cd.document_kind = 'prescription'
       ORDER BY cd.created_at DESC LIMIT 100`
    )
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id,
    consultationId: r.consultation_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    createdAt: r.created_at,
  }));
}
