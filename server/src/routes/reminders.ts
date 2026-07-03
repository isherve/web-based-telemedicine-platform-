import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ServiceError } from '../services/consultationService.js';
import { createReminder, listReminders, deleteReminder } from '../services/reminderService.js';

export const reminderRouter = Router();

function handle(res: Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

reminderRouter.get('/', requireAuth, (req, res) => {
  res.json({ reminders: listReminders(req.profile!.id) });
});

reminderRouter.post('/', requireAuth, (req, res) => {
  try {
    res.status(201).json({ reminder: createReminder(req.profile!.id, req.body) });
  } catch (err) {
    handle(res, err);
  }
});

reminderRouter.delete('/:id', requireAuth, (req, res) => {
  try {
    deleteReminder(req.profile!.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handle(res, err);
  }
});
