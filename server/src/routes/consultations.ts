import { Router } from 'express';
import { requireAuth, requireDoctor, requireRole } from '../middleware/auth.js';
import {
  ServiceError,
  getConsultation,
  getDoctorAnalytics,
  getDoctorStats,
  getMyData,
  getPatientHistory,
  getQueuePosition,
  listDoctorConsultations,
  listPatientConsultations,
  listPendingPayments,
  listRegularPatients,
  markComplete,
  processPayment,
  submitPayment,
  submitTriage,
  updateClinicTariff,
  updateDoctorProfile,
  updatePatientProfile,
  verifyPayment,
} from '../services/consultationService.js';
import { getDoctorRatings, getRating, submitRating } from '../services/ratingService.js';
import { roleOf } from '../services/authService.js';
import { getPublicSchedule } from '../services/scheduleService.js';
import { mapProfile } from '../utils/mappers.js';
import { db } from '../db/client.js';

export const consultationRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

consultationRouter.get('/doctor', requireAuth, requireDoctor, (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ consultations: listDoctorConsultations(req.profile!.id, status) });
});

consultationRouter.get('/patient', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  res.json({ consultations: listPatientConsultations(req.profile!.id) });
});

consultationRouter.get('/doctor/stats', requireAuth, requireDoctor, (req, res) => {
  res.json(getDoctorStats(req.profile!.id));
});

consultationRouter.get('/doctor/patients', requireAuth, requireDoctor, (req, res) => {
  res.json({ patients: listRegularPatients(req.profile!.id) });
});

consultationRouter.get('/doctor/analytics', requireAuth, requireDoctor, (req, res) => {
  res.json(getDoctorAnalytics(req.profile!.id));
});

consultationRouter.get('/doctor/ratings', requireAuth, requireDoctor, (req, res) => {
  res.json(getDoctorRatings(req.profile!.id));
});

consultationRouter.get('/patient/:id/history', requireAuth, requireDoctor, (req, res) => {
  try {
    res.json(getPatientHistory(req.profile!.id, req.params.id));
  } catch (err) {
    handle(res, err);
  }
});

// Patient self-service data export (data portability).
consultationRouter.get('/me/data', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  res.json(getMyData(req.profile!.id));
});

// Patient updates own clinical flags / consent.
consultationRouter.patch('/me/profile', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  const updated = updatePatientProfile(req.profile!.id, req.body);
  res.json({ profile: mapProfile(updated) });
});

// Finance (and doctor) view all consultations awaiting payment verification.
consultationRouter.get(
  '/pending-payments',
  requireAuth,
  requireRole('finance', 'doctor'),
  (_req, res) => {
    res.json({ consultations: listPendingPayments() });
  }
);

consultationRouter.get('/doctor/info', requireAuth, (_req, res) => {
  const row = db.prepare('SELECT * FROM profiles WHERE is_doctor = 1 LIMIT 1').get() as
    | Record<string, unknown>
    | undefined;
  if (!row) return res.status(404).json({ error: 'No doctor found.' });
  res.json({ doctor: mapProfile(row) });
});

consultationRouter.get('/schedule/public', (_req, res) => {
  res.json({ schedule: getPublicSchedule() });
});

consultationRouter.get('/:id', requireAuth, (req, res) => {
  try {
    res.json({
      consultation: getConsultation(req.profile!.id, req.profile!.is_doctor === 1, req.params.id),
    });
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.post('/triage', requireAuth, async (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    const c = await submitTriage(req.profile!.id, req.body);
    res.status(201).json({ consultation: c });
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.post('/:id/submit-payment', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    res.json({
      consultation: submitPayment(
        req.profile!.id,
        req.params.id,
        req.body.transactionId,
        req.body.provider
      ),
    });
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.post('/:id/pay', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    res.json(processPayment(req.profile!.id, req.params.id, req.body));
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.get('/:id/queue-position', requireAuth, (req, res) => {
  try {
    res.json(getQueuePosition(req.profile!.id, req.params.id));
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.get('/:id/rating', requireAuth, (req, res) => {
  res.json({ rating: getRating(req.params.id) });
});

consultationRouter.post('/:id/rating', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    res.json(submitRating(req.profile!.id, req.params.id, req.body.stars, req.body.comment));
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.post(
  '/:id/verify-payment',
  requireAuth,
  requireRole('doctor', 'finance'),
  (req, res) => {
    try {
      const isFinance = roleOf(req.profile!) === 'finance';
      res.json({
        consultation: verifyPayment(req.profile!.id, req.params.id, req.body.transactionId, {
          bypassOwnership: isFinance,
        }),
      });
    } catch (err) {
      handle(res, err);
    }
  }
);

consultationRouter.post('/:id/complete', requireAuth, requireDoctor, (req, res) => {
  try {
    res.json({ consultation: markComplete(req.profile!.id, req.params.id) });
  } catch (err) {
    handle(res, err);
  }
});

consultationRouter.patch('/doctor/profile', requireAuth, requireDoctor, (req, res) => {
  updateDoctorProfile(req.profile!.id, req.body);
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(req.profile!.id);
  res.json({ doctor: mapProfile(row as Record<string, unknown>) });
});

// Finance owns billing: allow finance staff to edit the clinic tariff.
consultationRouter.patch('/clinic/tariff', requireAuth, requireRole('finance'), (req, res) => {
  try {
    const row = updateClinicTariff(req.body);
    res.json({ doctor: mapProfile(row) });
  } catch (err) {
    handle(res, err);
  }
});
