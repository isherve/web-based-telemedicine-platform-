import { Router } from 'express';
import { requireAuth, requireDoctor } from '../middleware/auth.js';
import {
  listDoctorFollowUps,
  listPatientFollowUps,
  replyFollowUp,
  sendFollowUp,
} from '../services/followUpService.js';
import { ServiceError } from '../services/consultationService.js';

export const followUpRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

followUpRouter.get('/doctor', requireAuth, requireDoctor, (req, res) => {
  res.json({ followUps: listDoctorFollowUps(req.profile!.id) });
});

followUpRouter.get('/patient', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  res.json({ followUps: listPatientFollowUps(req.profile!.id) });
});

followUpRouter.post('/:consultationId', requireAuth, requireDoctor, (req, res) => {
  try {
    res.status(201).json({
      followUp: sendFollowUp(req.profile!.id, req.params.consultationId, req.body.message),
    });
  } catch (err) {
    handle(res, err);
  }
});

followUpRouter.post('/:id/reply', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    res.json({ followUp: replyFollowUp(req.profile!.id, req.params.id, req.body.reply) });
  } catch (err) {
    handle(res, err);
  }
});
