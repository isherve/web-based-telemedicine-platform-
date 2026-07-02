import { Router } from 'express';
import { requireAuth, requireDoctor } from '../middleware/auth.js';
import { db } from '../db/client.js';
import { getAvailableDates, getDoctorSchedule, saveSchedule } from '../services/scheduleService.js';

export const scheduleRouter = Router();

scheduleRouter.get('/', requireAuth, requireDoctor, (req, res) => {
  res.json({ schedule: getDoctorSchedule(req.profile!.id) });
});

scheduleRouter.get('/available-dates', (_req, res) => {
  const row = db.prepare('SELECT id FROM profiles WHERE is_doctor = 1 LIMIT 1').get() as
    | { id: string }
    | undefined;
  if (!row) return res.json({ dates: [] });
  res.json({ dates: getAvailableDates(row.id) });
});

scheduleRouter.put('/', requireAuth, requireDoctor, (req, res) => {
  res.json({ schedule: saveSchedule(req.profile!.id, req.body.slots) });
});
