import { db } from '../db/client.js';

/** Financial report data (income from verified consultation payments). */
export function financialReport() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';

  const sum = (sql: string, ...params: unknown[]) =>
    (db.prepare(sql).get(...params) as { total: number }).total;

  const todayIncome = sum(
    `SELECT COALESCE(SUM(payment_amount),0) AS total FROM consultations WHERE paid = 1 AND date(created_at) = date(?)`,
    today
  );
  const monthIncome = sum(
    `SELECT COALESCE(SUM(payment_amount),0) AS total FROM consultations WHERE paid = 1 AND date(created_at) >= date(?)`,
    monthStart
  );
  const totalIncome = sum(`SELECT COALESCE(SUM(payment_amount),0) AS total FROM consultations WHERE paid = 1`);

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) AS paid,
         SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS pending
       FROM consultations`
    )
    .get() as { total: number; paid: number; pending: number };

  const byDay = db
    .prepare(
      `SELECT date(created_at) AS date, COALESCE(SUM(payment_amount),0) AS income, COUNT(*) AS count
       FROM consultations WHERE paid = 1
       GROUP BY date(created_at) ORDER BY date DESC LIMIT 14`
    )
    .all() as { date: string; income: number; count: number }[];

  const recent = db
    .prepare(
      `SELECT c.created_at AS date, p.full_name AS patient_name, c.payment_amount AS amount,
              c.momo_transaction_id AS txn
       FROM consultations c LEFT JOIN profiles p ON p.id = c.patient_id
       WHERE c.paid = 1 ORDER BY c.created_at DESC LIMIT 25`
    )
    .all() as { date: string; patient_name: string; amount: number; txn: string }[];

  // Pharmacy revenue (value of dispensed medicines).
  const pharmacyRevenue = sum(
    `SELECT COALESCE(SUM(quantity * unit_price),0) AS total FROM dispenses`
  );

  return {
    generatedAt: new Date().toISOString(),
    todayIncome,
    monthIncome,
    totalIncome,
    pharmacyRevenue,
    totalConsultations: counts.total ?? 0,
    paidConsultations: counts.paid ?? 0,
    pendingConsultations: counts.pending ?? 0,
    byDay,
    recent: recent.map((r) => ({
      date: r.date,
      patientName: r.patient_name,
      amount: r.amount,
      txn: r.txn,
    })),
  };
}

/** Pharmacy report data (stock levels, low-stock, dispensing activity). */
export function pharmacyReport() {
  const medicines = db.prepare('SELECT * FROM medicines ORDER BY name').all() as Record<string, unknown>[];
  const stockValue = medicines.reduce(
    (acc, m) => acc + (m.quantity as number) * (m.unit_price as number),
    0
  );
  const lowStock = medicines.filter((m) => (m.quantity as number) <= (m.reorder_level as number));

  const dispenses = db
    .prepare(
      `SELECT d.created_at AS date, m.name AS medicine_name, d.quantity AS quantity,
              d.unit_price AS unit_price, p.full_name AS patient_name
       FROM dispenses d
       LEFT JOIN medicines m ON m.id = d.medicine_id
       LEFT JOIN profiles p ON p.id = d.patient_id
       ORDER BY d.created_at DESC LIMIT 50`
    )
    .all() as Record<string, unknown>[];

  const totalDispensed = (db.prepare('SELECT COALESCE(SUM(quantity),0) AS t FROM dispenses').get() as {
    t: number;
  }).t;

  return {
    generatedAt: new Date().toISOString(),
    medicineCount: medicines.length,
    stockValue,
    totalDispensed,
    lowStockCount: lowStock.length,
    medicines: medicines.map((m) => ({
      name: m.name,
      form: m.form,
      quantity: m.quantity,
      reorderLevel: m.reorder_level,
      unitPrice: m.unit_price,
      low: (m.quantity as number) <= (m.reorder_level as number),
    })),
    lowStock: lowStock.map((m) => ({ name: m.name, quantity: m.quantity, reorderLevel: m.reorder_level })),
    dispenses: dispenses.map((d) => ({
      date: d.date,
      medicineName: d.medicine_name,
      quantity: d.quantity,
      unitPrice: d.unit_price,
      patientName: d.patient_name,
    })),
  };
}
