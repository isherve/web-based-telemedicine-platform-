import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { generateSalt, hashPassword } from '../services/authService.js';

const SEED_MARKER = 'demo_seed_v2';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

function profileId(phoneOrEmail: string): string | null {
  const row = db
    .prepare('SELECT id FROM profiles WHERE phone_number = ? OR email = ?')
    .get(phoneOrEmail, phoneOrEmail.toLowerCase()) as { id: string } | undefined;
  return row?.id ?? null;
}

function ensurePatient(
  phone: string,
  fullName: string,
  password: string,
  extras?: { allergies?: string; chronic?: string }
): string {
  const existing = profileId(phone);
  if (existing) {
    if (extras?.allergies || extras?.chronic) {
      db.prepare(
        'UPDATE profiles SET allergies = COALESCE(?, allergies), chronic_conditions = COALESCE(?, chronic_conditions) WHERE id = ?'
      ).run(extras.allergies ?? null, extras.chronic ?? null, existing);
    }
    return existing;
  }
  const id = randomUUID();
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  db.prepare(
    `INSERT INTO profiles (id, phone_number, full_name, is_doctor, role, password_hash, password_salt, allergies, chronic_conditions, ai_consent, consented_at)
     VALUES (?, ?, ?, 0, 'patient', ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    phone,
    fullName,
    hash,
    salt,
    extras?.allergies ?? null,
    extras?.chronic ?? null,
    new Date().toISOString()
  );
  return id;
}

interface ConsultSeed {
  patientPhone: string;
  status: 'pending_payment' | 'in_process' | 'complete';
  sex: string;
  severity: string;
  duration: string;
  category: string;
  description: string;
  urgency: 'low' | 'medium' | 'high';
  urgencyScore: number;
  paid: number;
  paymentAmount?: number;
  paymentProvider?: string;
  momoTxn?: string;
  daysBack: number;
  aiBrief: string;
  aiSuggestions: string;
  messages?: { from: 'patient' | 'doctor'; text: string }[];
  rating?: { stars: number; comment: string };
  followUp?: string;
  document?: 'prescription' | 'transfer';
  dispense?: { medicineName: string; qty: number };
}

const CONSULTATIONS: ConsultSeed[] = [
  {
    patientPhone: '+250788333444',
    status: 'in_process',
    sex: 'female',
    severity: 'moderate',
    duration: 'few_days',
    category: 'Cough',
    description: 'Dry cough with mild chest tightness, worse at night. No fever today.',
    urgency: 'medium',
    urgencyScore: 35,
    paid: 1,
    paymentAmount: 5000,
    paymentProvider: 'momo',
    momoTxn: 'MOMO-2026-001',
    daysBack: 0,
    aiBrief: 'Female patient reports 3-day dry cough with nocturnal chest tightness. No current fever.',
    aiSuggestions: '1. Upper respiratory infection\n2. Bronchitis\n3. Asthma exacerbation\n4. COVID-19 (rule out)',
    messages: [
      { from: 'doctor', text: 'Hello Amina, I see your cough symptoms. How are you feeling today?' },
      { from: 'patient', text: 'A bit better but still coughing at night, Doctor.' },
      { from: 'doctor', text: 'Any difficulty breathing or chest pain when coughing?' },
      { from: 'patient', text: 'Just tightness, no sharp pain.' },
    ],
  },
  {
    patientPhone: '+250788555666',
    status: 'in_process',
    sex: 'male',
    severity: 'severe',
    duration: 'today',
    category: 'Fever',
    description: 'High fever 39°C since this morning, body aches, chills. History of malaria.',
    urgency: 'high',
    urgencyScore: 75,
    paid: 1,
    paymentAmount: 5000,
    paymentProvider: 'airtel',
    momoTxn: 'AIR-2026-042',
    daysBack: 0,
    aiBrief: 'Male patient with acute high fever, myalgia, chills. Prior malaria history.',
    aiSuggestions: '1. Malaria\n2. Typhoid fever\n3. Viral infection\n4. UTI with fever',
    messages: [
      { from: 'doctor', text: 'Jean, your fever is concerning. Have you taken any medication?' },
      { from: 'patient', text: 'Only paracetamol, it helped a little.' },
    ],
    followUp: 'Please monitor your temperature every 4 hours and return if fever exceeds 39.5°C.',
  },
  {
    patientPhone: '+250788111222',
    status: 'pending_payment',
    sex: 'male',
    severity: 'mild',
    duration: 'week_plus',
    category: 'Headache',
    description: 'Recurring headaches 2-3 times per week, usually afternoon. No vision changes.',
    urgency: 'low',
    urgencyScore: 20,
    paid: 0,
    daysBack: 0,
    aiBrief: 'Male patient with recurrent tension-type headaches, weekly pattern.',
    aiSuggestions: '1. Tension headache\n2. Migraine\n3. Hypertension\n4. Eye strain',
  },
  {
    patientPhone: '+250788777888',
    status: 'pending_payment',
    sex: 'female',
    severity: 'moderate',
    duration: 'few_days',
    category: 'Stomach pain',
    description: 'Cramping abdominal pain after meals, mild nausea, no vomiting.',
    urgency: 'medium',
    urgencyScore: 30,
    paid: 0,
    daysBack: 1,
    aiBrief: 'Female patient with post-prandial abdominal cramps and nausea.',
    aiSuggestions: '1. Gastritis\n2. Food intolerance\n3. Peptic ulcer\n4. Intestinal parasites',
  },
  {
    patientPhone: '+250788333444',
    status: 'complete',
    sex: 'female',
    severity: 'moderate',
    duration: 'few_days',
    category: 'Skin rash',
    description: 'Itchy red rash on arms started 4 days ago after new soap.',
    urgency: 'low',
    urgencyScore: 15,
    paid: 1,
    paymentAmount: 5000,
    paymentProvider: 'momo',
    momoTxn: 'MOMO-2026-088',
    daysBack: 14,
    aiBrief: 'Contact dermatitis suspected after new soap exposure.',
    aiSuggestions: '1. Allergic contact dermatitis\n2. Eczema flare\n3. Fungal infection',
    rating: { stars: 5, comment: 'Dr. Kevine was very helpful and explained everything clearly!' },
    document: 'prescription',
    dispense: { medicineName: 'Paracetamol 500mg', qty: 20 },
    followUp: 'Apply prescribed cream twice daily. Avoid the new soap. Return if rash spreads.',
  },
  {
    patientPhone: '+250788555666',
    status: 'complete',
    sex: 'male',
    severity: 'severe',
    duration: 'today',
    category: 'Breathing difficulty',
    description: 'Shortness of breath after walking upstairs. Smoker 5 years.',
    urgency: 'high',
    urgencyScore: 70,
    paid: 1,
    paymentAmount: 5000,
    paymentProvider: 'momo',
    momoTxn: 'MOMO-2026-055',
    daysBack: 21,
    aiBrief: 'Male smoker with exertional dyspnea. Requires respiratory assessment.',
    aiSuggestions: '1. COPD\n2. Asthma\n3. Pneumonia\n4. Cardiac cause',
    rating: { stars: 4, comment: 'Good consultation, waiting for test results.' },
    document: 'transfer',
    dispense: { medicineName: 'Amoxicillin 500mg', qty: 21 },
  },
  {
    patientPhone: '+250788999000',
    status: 'complete',
    sex: 'female',
    severity: 'mild',
    duration: 'month_plus',
    category: 'Mental health',
    description: 'Feeling anxious and having trouble sleeping for 3 weeks. Work stress.',
    urgency: 'medium',
    urgencyScore: 25,
    paid: 1,
    paymentAmount: 5000,
    paymentProvider: 'airtel',
    momoTxn: 'AIR-2026-019',
    daysBack: 30,
    aiBrief: 'Female patient with anxiety and insomnia related to occupational stress.',
    aiSuggestions: '1. Generalized anxiety\n2. Adjustment disorder\n3. Depression\n4. Sleep disorder',
    rating: { stars: 5, comment: 'Very understanding doctor. Felt heard.' },
    followUp: 'Try the relaxation exercises we discussed. Follow up in 2 weeks.',
  },
  {
    patientPhone: '+250788444555',
    status: 'complete',
    sex: 'female',
    severity: 'moderate',
    duration: 'week_plus',
    category: 'Urinary problems',
    description: 'Burning sensation when urinating for 5 days. No fever.',
    urgency: 'medium',
    urgencyScore: 28,
    paid: 1,
    paymentAmount: 5000,
    paymentProvider: 'momo',
    momoTxn: 'MOMO-2026-112',
    daysBack: 10,
    aiBrief: 'Dysuria without fever — likely lower UTI.',
    aiSuggestions: '1. Urinary tract infection\n2. STI\n3. Vaginitis',
    rating: { stars: 5, comment: 'Quick and professional service.' },
    document: 'prescription',
    dispense: { medicineName: 'Amoxicillin 500mg', qty: 14 },
  },
];

export function seedDemoData(): void {
  const done = db
    .prepare("SELECT 1 FROM audit_log WHERE action = ? LIMIT 1")
    .get(SEED_MARKER);
  if (done) return;

  const doctorId = profileId('doctor@gara.rw');
  const pharmacyId = profileId('pharma@gara.rw');
  if (!doctorId) {
    console.log('  Demo seed skipped: doctor account not found.');
    return;
  }

  const p1 = ensurePatient('+250788333444', 'Amina Keza', 'Patient@123', {
    allergies: 'Penicillin',
    chronic: 'None',
  });
  const p2 = ensurePatient('+250788555666', 'Jean Habimana', 'Patient@123', {
    allergies: 'None',
    chronic: 'Hypertension',
  });
  const p3 = ensurePatient('+250788111222', 'Test Patient', 'pass123');
  const p4 = ensurePatient('+250788777888', 'Grace Uwase', 'Patient@123', {
    allergies: 'Sulfa drugs',
  });
  const p5 = ensurePatient('+250788999000', 'Claudine Mukamana', 'Patient@123');
  const p6 = ensurePatient('+250788444555', 'Patrick Niyonsaba', 'Patient@123');

  const phoneToId: Record<string, string> = {
    '+250788333444': p1,
    '+250788555666': p2,
    '+250788111222': p3,
    '+250788777888': p4,
    '+250788999000': p5,
    '+250788444555': p6,
  };

  const insertConsult = db.prepare(
    `INSERT INTO consultations (
      id, patient_id, doctor_id, status, biological_sex, severity, duration,
      symptom_category, symptom_description, ai_brief_summary, ai_suggestions, language,
      consultation_fee, momo_transaction_id, payment_amount, payment_provider,
      urgency, urgency_score, paid, closed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en', 5000, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertMsg = db.prepare(
    `INSERT INTO messages (id, consultation_id, sender_id, message_type, content, created_at)
     VALUES (?, ?, ?, 'text', ?, ?)`
  );

  const consultIds: string[] = [];

  for (const c of CONSULTATIONS) {
    const patientId = phoneToId[c.patientPhone];
    if (!patientId) continue;
    const id = randomUUID();
    consultIds.push(id);
    const created = daysAgo(c.daysBack);
    const closed = c.status === 'complete' ? daysAgo(c.daysBack - 1) : null;

    insertConsult.run(
      id,
      patientId,
      doctorId,
      c.status,
      c.sex,
      c.severity,
      c.duration,
      c.category,
      c.description,
      c.aiBrief,
      c.aiSuggestions,
      c.momoTxn ?? null,
      c.paymentAmount ?? null,
      c.paymentProvider ?? null,
      c.urgency,
      c.urgencyScore,
      c.paid,
      closed,
      created
    );

    if (c.messages) {
      for (const m of c.messages) {
        insertMsg.run(
          randomUUID(),
          id,
          m.from === 'doctor' ? doctorId : patientId,
          m.text,
          created
        );
      }
    }

    if (c.rating) {
      db.prepare(
        `INSERT OR IGNORE INTO ratings (id, consultation_id, patient_id, doctor_id, stars, comment, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, patientId, doctorId, c.rating.stars, c.rating.comment, closed ?? created);
    }

    if (c.followUp) {
      db.prepare(
        `INSERT INTO follow_ups (id, consultation_id, doctor_id, patient_id, doctor_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, doctorId, patientId, c.followUp, closed ?? created);
    }

    if (c.document) {
      db.prepare(
        `INSERT INTO clinical_documents (id, consultation_id, patient_id, document_kind, pdf_storage_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, patientId, c.document, `/uploads/demo-${c.document}.pdf`, closed ?? created);
    }

    if (c.dispense && pharmacyId) {
      const med = db
        .prepare('SELECT id, unit_price, quantity FROM medicines WHERE name = ?')
        .get(c.dispense.medicineName) as { id: string; unit_price: number; quantity: number } | undefined;
      if (med) {
        db.prepare(
          `INSERT INTO dispenses (id, medicine_id, consultation_id, patient_id, dispensed_by, quantity, unit_price, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          randomUUID(),
          med.id,
          id,
          patientId,
          pharmacyId,
          c.dispense.qty,
          med.unit_price,
          `Dispensed for ${c.category}`,
          closed ?? created
        );
        db.prepare('UPDATE medicines SET quantity = ? WHERE id = ?').run(
          Math.max(0, med.quantity - c.dispense.qty),
          med.id
        );
      }
    }
  }

  // Appointments
  const apptData: { patientId: string; consultIdx: number; date: string; status: string; notes: string }[] = [
    { patientId: p1, consultIdx: 0, date: daysAhead(2), status: 'confirmed', notes: 'Follow-up for cough' },
    { patientId: p2, consultIdx: 1, date: daysAhead(5), status: 'pending', notes: 'Fever review' },
    { patientId: p4, consultIdx: 3, date: daysAhead(1), status: 'confirmed', notes: 'Stomach pain check' },
    { patientId: p5, consultIdx: 6, date: daysAgo(5), status: 'completed', notes: 'Mental health follow-up' },
    { patientId: p3, consultIdx: 2, date: daysAhead(7), status: 'pending', notes: 'Headache evaluation' },
  ];

  for (const a of apptData) {
    const cid = consultIds[a.consultIdx];
    if (!cid) continue;
    db.prepare(
      `INSERT INTO appointments (id, patient_id, doctor_id, consultation_id, requested_date, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(randomUUID(), a.patientId, doctorId, cid, a.date, a.status, a.notes, daysAgo(2));
  }

  // Notifications for every user
  const notifInsert = db.prepare(
    `INSERT INTO notifications (id, user_id, title, body, type, is_read, consultation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const allUsers = db.prepare('SELECT id, role, full_name FROM profiles').all() as {
    id: string;
    role: string;
    full_name: string;
  }[];

  for (const u of allUsers) {
    const role = u.role ?? 'patient';
    const items: { title: string; body: string; type: string; read: number }[] = [];

    if (role === 'patient') {
      items.push(
        { title: 'Welcome to Gara', body: 'Your telehealth platform is ready. Start a triage anytime.', type: 'welcome', read: 1 },
        { title: 'Appointment reminder', body: 'You have an upcoming appointment. Check the Appointments tab.', type: 'appointment', read: 0 },
        { title: 'Payment confirmed', body: 'Your consultation payment of 5,000 RWF was verified.', type: 'payment', read: 1 },
        { title: 'Medicine dispensed', body: 'Your prescription has been prepared at the pharmacy.', type: 'pharmacy', read: 0 },
        { title: 'Follow-up message', body: 'Dr. Kevine sent you a follow-up. Check the Follow-ups tab.', type: 'followup', read: 0 }
      );
    } else if (role === 'doctor') {
      items.push(
        { title: 'New patient in queue', body: 'Jean Habimana submitted triage with high urgency.', type: 'triage', read: 0 },
        { title: 'Payment verified', body: 'Amina Keza payment confirmed. Chat is now open.', type: 'payment', read: 1 },
        { title: 'New rating', body: 'You received a 5-star rating from Amina Keza!', type: 'rating', read: 0 },
        { title: 'Appointment request', body: 'Grace Uwase requested an appointment.', type: 'appointment', read: 0 }
      );
    } else if (role === 'finance') {
      items.push(
        { title: 'Pending payment', body: 'Test Patient submitted payment awaiting verification.', type: 'payment', read: 0 },
        { title: 'Daily summary', body: 'Today: 17,000 RWF collected from 4 consultations.', type: 'report', read: 1 },
        { title: 'Pharmacy revenue', body: '750 RWF from medicine dispensing this week.', type: 'report', read: 0 }
      );
    } else if (role === 'pharmacy') {
      items.push(
        { title: 'Low stock alert', body: 'Cough Syrup is at reorder level (40 units).', type: 'stock', read: 0 },
        { title: 'New prescription', body: 'Prescription ready for Amina Keza — Paracetamol 500mg.', type: 'prescription', read: 0 },
        { title: 'Dispense completed', body: 'Amoxicillin dispensed to Patrick Niyonsaba.', type: 'dispense', read: 1 }
      );
    }

    for (const n of items) {
      notifInsert.run(
        randomUUID(),
        u.id,
        n.title,
        n.body,
        n.type,
        n.read,
        consultIds[0] ?? null,
        daysAgo(Math.floor(Math.random() * 5))
      );
    }
  }

  // Patient reply on one follow-up
  const fu = db.prepare('SELECT id FROM follow_ups LIMIT 1').get() as { id: string } | undefined;
  if (fu) {
    db.prepare('UPDATE follow_ups SET patient_reply = ?, reply_at = ? WHERE id = ?').run(
      'Thank you Doctor, I will follow your advice.',
      daysAgo(1),
      fu.id
    );
  }

  db.prepare('INSERT INTO audit_log (id, actor_id, action, entity, created_at) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    doctorId,
    SEED_MARKER,
    'demo',
    new Date().toISOString()
  );

  console.log('  Demo data seeded (consultations, messages, appointments, notifications, dispenses).');
}
