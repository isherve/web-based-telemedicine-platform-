import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { financialReport, pharmacyReport } from '../services/reportService.js';

export const reportRouter = Router();

// Finance + doctor can see financial reports.
reportRouter.get('/financial', requireAuth, requireRole('finance', 'doctor'), (_req, res) => {
  res.json(financialReport());
});

// Pharmacy + doctor + finance can see pharmacy reports.
reportRouter.get('/pharmacy', requireAuth, requireRole('pharmacy', 'doctor', 'finance'), (_req, res) => {
  res.json(pharmacyReport());
});
