import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ServiceError } from '../services/consultationService.js';
import {
  listDoctorCandidates,
  listConsultationsForAssignment,
  suggestAssignment,
  assignConsultation,
  autoAssign,
} from '../services/assignmentService.js';

export const assignmentRouter = Router();

// Coordinators who may distribute patients: admins and finance staff.
const canCoordinate = requireRole('admin', 'finance');

function handle(res: Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

function langOf(v: unknown): 'en' | 'rw' | 'fr' {
  return v === 'rw' ? 'rw' : v === 'fr' ? 'fr' : 'en';
}

// Doctors ranked by schedule + workload + rating for the current moment.
assignmentRouter.get('/candidates', requireAuth, canCoordinate, (_req, res) => {
  res.json({ candidates: listDoctorCandidates() });
});

// Active consultations a coordinator can (re)assign.
assignmentRouter.get('/consultations', requireAuth, canCoordinate, (_req, res) => {
  res.json({ consultations: listConsultationsForAssignment() });
});

// AI/heuristic recommendation for one consultation.
assignmentRouter.get('/:id/suggest', requireAuth, canCoordinate, async (req, res) => {
  try {
    res.json({ suggestion: await suggestAssignment(req.params.id, langOf(req.query.language)) });
  } catch (err) {
    handle(res, err);
  }
});

// Manually assign to a chosen doctor.
assignmentRouter.post('/:id/assign', requireAuth, canCoordinate, (req, res) => {
  try {
    const consultation = assignConsultation(req.profile!.id, req.params.id, req.body.doctorId);
    res.json({ consultation });
  } catch (err) {
    handle(res, err);
  }
});

// Let the AI pick the best on-duty doctor and assign.
assignmentRouter.post('/:id/auto', requireAuth, canCoordinate, async (req, res) => {
  try {
    res.json(await autoAssign(req.profile!.id, req.params.id, langOf(req.body.language)));
  } catch (err) {
    handle(res, err);
  }
});
