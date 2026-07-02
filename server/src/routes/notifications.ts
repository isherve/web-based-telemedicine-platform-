import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listNotifications, markRead } from '../services/notificationService.js';

export const notificationRouter = Router();

notificationRouter.get('/', requireAuth, (req, res) => {
  res.json({ notifications: listNotifications(req.profile!.id) });
});

notificationRouter.post('/:id/read', requireAuth, (req, res) => {
  markRead(req.profile!.id, req.params.id);
  res.json({ ok: true });
});
