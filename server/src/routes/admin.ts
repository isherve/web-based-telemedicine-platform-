import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ServiceError } from '../services/consultationService.js';
import {
  systemStats,
  listUsers,
  setUserRole,
  doctorLeaderboard,
  recentAudit,
} from '../services/adminService.js';

export const adminRouter = Router();

function handle(res: Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

const isAdmin = requireRole('admin');

adminRouter.get('/stats', requireAuth, isAdmin, (_req, res) => {
  res.json({ stats: systemStats() });
});

adminRouter.get('/users', requireAuth, isAdmin, (req, res) => {
  res.json({ users: listUsers(req.query.role as string | undefined) });
});

adminRouter.patch('/users/:id/role', requireAuth, isAdmin, (req, res) => {
  try {
    res.json({ user: setUserRole(req.profile!.id, req.params.id, req.body.role) });
  } catch (err) {
    handle(res, err);
  }
});

adminRouter.get('/doctors', requireAuth, isAdmin, (_req, res) => {
  res.json({ doctors: doctorLeaderboard() });
});

adminRouter.get('/audit', requireAuth, isAdmin, (_req, res) => {
  res.json({ audit: recentAudit() });
});
