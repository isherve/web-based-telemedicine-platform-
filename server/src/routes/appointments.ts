import { Router } from 'express';
import { requireAuth, requireDoctor } from '../middleware/auth.js';
import {
  bookAppointment,
  listDoctorAppointments,
  listPatientAppointments,
  updateAppointmentStatus,
} from '../services/appointmentService.js';
import { ServiceError } from '../services/consultationService.js';

export const appointmentRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

appointmentRouter.get('/doctor', requireAuth, requireDoctor, (req, res) => {
  res.json({ appointments: listDoctorAppointments(req.profile!.id) });
});

appointmentRouter.get('/patient', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  res.json({ appointments: listPatientAppointments(req.profile!.id) });
});

appointmentRouter.post('/', requireAuth, (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    res.status(201).json({ appointment: bookAppointment(req.profile!.id, req.body) });
  } catch (err) {
    handle(res, err);
  }
});

appointmentRouter.patch('/:id/status', requireAuth, requireDoctor, (req, res) => {
  try {
    res.json({
      appointment: updateAppointmentStatus(req.profile!.id, req.params.id, req.body.status),
    });
  } catch (err) {
    handle(res, err);
  }
});
