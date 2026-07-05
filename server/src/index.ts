import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { runMigrations, db } from './db/client.js';
import { seedDemoAccounts, seedDemoData } from './db/seedDemo.js';
import { authRouter } from './routes/auth.js';
import { consultationRouter } from './routes/consultations.js';
import { messageRouter } from './routes/messages.js';
import { documentRouter } from './routes/documents.js';
import { appointmentRouter } from './routes/appointments.js';
import { scheduleRouter } from './routes/schedules.js';
import { followUpRouter } from './routes/followUps.js';
import { notificationRouter } from './routes/notifications.js';
import { uploadRouter } from './routes/uploads.js';
import { pharmacyRouter } from './routes/pharmacy.js';
import { reportRouter } from './routes/reports.js';
import { aiRouter } from './routes/ai.js';
import { clinicalRouter } from './routes/clinical.js';
import { reminderRouter } from './routes/reminders.js';
import { adminRouter } from './routes/admin.js';
import { assignmentRouter } from './routes/assignments.js';
import { initRealtime } from './realtime/io.js';
import { createNotification } from './services/notificationService.js';
import { sendSms } from './services/smsService.js';
import { fireDueReminders } from './services/reminderService.js';
import { generateSalt, hashPassword } from './services/authService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 4000);
// Render sets RENDER_EXTERNAL_URL automatically; fall back to localhost for dev.
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173';
const isDev = process.env.NODE_ENV !== 'production';

/** Allow any localhost port in dev (Vite may pick 5173, 5174, 5175, …). */
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin === CLIENT_ORIGIN) return true;
  return /^https?:\/\/localhost(:\d+)?$/.test(origin);
}

// Apply schema on boot (idempotent).
runMigrations();
seedDemoAccounts();
seedDemoData();

// Seed doctor payment defaults if missing (single-doctor instance).
db.prepare(
  `UPDATE profiles SET consultation_fee = COALESCE(consultation_fee, 5000),
   momo_number = COALESCE(momo_number, '*182*8*1*0780000000#')
   WHERE is_doctor = 1 AND (consultation_fee IS NULL OR momo_number IS NULL)`
).run();

// Seed a default admin account on first run (offline superuser).
const adminExists = db.prepare("SELECT id FROM profiles WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const salt = generateSalt();
  db.prepare(
    `INSERT INTO profiles (id, email, full_name, is_doctor, role, password_hash, password_salt)
     VALUES (?, 'admin@gara.rw', 'System Administrator', 0, 'admin', ?, ?)`
  ).run(randomUUID(), hashPassword('admin123', salt), salt);
}

// Seed a starter pharmacy inventory on first run.
const medCount = (db.prepare('SELECT COUNT(*) AS c FROM medicines').get() as { c: number }).c;
if (medCount === 0) {
  const insertMed = db.prepare(
    `INSERT INTO medicines (id, name, form, quantity, reorder_level, unit_price) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const starter: [string, string, number, number, number][] = [
    ['Paracetamol 500mg', 'Tablet', 200, 40, 100],
    ['Amoxicillin 500mg', 'Capsule', 120, 30, 250],
    ['Artemether/Lumefantrine', 'Tablet', 80, 20, 1200],
    ['Oral Rehydration Salts', 'Sachet', 150, 30, 300],
    ['Ibuprofen 400mg', 'Tablet', 90, 25, 150],
    ['Cough Syrup', 'Bottle', 40, 15, 1500],
    ['Zinc Sulphate', 'Tablet', 60, 20, 200],
  ];
  for (const [name, form, qty, reorder, price] of starter) {
    insertMed.run(randomUUID(), name, form, qty, reorder, price);
  }
}

// Seed default Mon–Fri schedule for the single doctor if none exists.
const doctorRow = db.prepare('SELECT id FROM profiles WHERE is_doctor = 1 LIMIT 1').get() as
  | { id: string }
  | undefined;
if (doctorRow) {
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM doctor_schedules WHERE doctor_id = ?')
    .get(doctorRow.id) as { c: number };
  if (count.c === 0) {
    const insert = db.prepare(
      `INSERT INTO doctor_schedules (id, doctor_id, day_of_week, open_time, close_time, is_available, slot_duration_minutes)
       VALUES (?, ?, ?, '08:00', '17:00', ?, 30)`
    );
    for (let dow = 1; dow <= 7; dow++) {
      insert.run(randomUUID(), doctorRow.id, dow, dow <= 5 ? 1 : 0);
    }
  }
}

const app = express();
app.use(
  cors({
    origin: isDev
      ? (origin, callback) => callback(null, isAllowedOrigin(origin))
      : CLIENT_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

// Local file storage for uploads (replaces Supabase Storage).
const uploadsDir = process.env.GARA_UPLOADS_PATH ?? join(__dirname, '..', 'uploads');
mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    mode: isDev ? 'development' : 'production',
    origin: CLIENT_ORIGIN,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/consultations', consultationRouter);
app.use('/api/messages', messageRouter);
app.use('/api/documents', documentRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/schedules', scheduleRouter);
app.use('/api/follow-ups', followUpRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/uploads', uploadRouter);
app.use('/api/pharmacy', pharmacyRouter);
app.use('/api/reports', reportRouter);
app.use('/api/ai', aiRouter);
app.use('/api/clinical', clinicalRouter);
app.use('/api/reminders', reminderRouter);
app.use('/api/admin', adminRouter);
app.use('/api/assignments', assignmentRouter);

// In production, serve the Vite-built React app from the same origin (Render).
if (!isDev) {
  const distDir = join(__dirname, '..', '..', 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/socket.io')
    ) {
      return next();
    }
    res.sendFile(join(distDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

const server = createServer(app);
initRealtime(
  server,
  isDev
    ? (origin, callback) => callback(null, isAllowedOrigin(origin))
    : CLIENT_ORIGIN
);

// ---- Appointment reminder job (in-app + SMS hook) ----
// Sends a reminder ~24h and ~1h before a confirmed appointment. In-memory dedupe
// keeps it simple/offline; a persisted "reminded" flag can replace this later.
const remindedWindows = new Set<string>();
function runReminderSweep() {
  const nowMs = Date.now();
  const rows = db
    .prepare(
      `SELECT a.id, a.requested_date, a.patient_id, p.phone_number AS phone, p.full_name AS name
       FROM appointments a LEFT JOIN profiles p ON p.id = a.patient_id
       WHERE a.status = 'confirmed' AND a.requested_date IS NOT NULL`
    )
    .all() as { id: string; requested_date: string; patient_id: string; phone: string; name: string }[];

  for (const a of rows) {
    const when = new Date(a.requested_date).getTime();
    if (Number.isNaN(when)) continue;
    const diffH = (when - nowMs) / 3_600_000;
    const windows: [string, boolean][] = [
      ['24h', diffH <= 24 && diffH > 23],
      ['1h', diffH <= 1 && diffH > 0],
    ];
    for (const [label, due] of windows) {
      const key = `${a.id}:${label}`;
      if (due && !remindedWindows.has(key)) {
        remindedWindows.add(key);
        const body = `Reminder: your appointment is in ${label === '24h' ? '24 hours' : '1 hour'} (${new Date(a.requested_date).toLocaleString()}).`;
        createNotification({
          userId: a.patient_id,
          title: 'Appointment reminder',
          body,
          type: 'appointment_reminder',
        });
        void sendSms(a.phone, `Gara: ${body}`);
      }
    }
  }
  // Fire any due medication/appointment reminders scheduled by users.
  try {
    fireDueReminders();
  } catch (err) {
    console.error('reminder sweep', err);
  }
}
setInterval(runReminderSweep, 60 * 1000);

server.listen(PORT, () => {
  const aiMode = process.env.GROQ_API_KEY?.trim()
    ? `online (Groq ${process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'})`
    : 'offline heuristics';
  console.log(`\n  Gara backend running (${isDev ? 'development' : 'production'})`);
  console.log(`  AI:       ${aiMode}`);
  console.log(`  Origin:   ${CLIENT_ORIGIN}`);
  console.log(`  API:      /api`);
  console.log(`  Uploads:  /uploads`);
  console.log(`  Realtime: /socket.io\n`);
  runReminderSweep();
});
