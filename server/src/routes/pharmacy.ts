import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ServiceError } from '../services/consultationService.js';
import {
  addMedicine,
  checkSafety,
  dispenseMedicine,
  listDispenses,
  listMedicines,
  listPrescriptions,
  restockMedicine,
  updateMedicine,
} from '../services/pharmacyService.js';
import { db } from '../db/client.js';

export const pharmacyRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

// Pharmacy + doctor can view stock; only pharmacy manages/dispenses.
const canView = requireRole('pharmacy', 'doctor', 'finance');
const isPharmacy = requireRole('pharmacy');

pharmacyRouter.get('/medicines', requireAuth, canView, (_req, res) => {
  res.json({ medicines: listMedicines() });
});

pharmacyRouter.post('/medicines', requireAuth, isPharmacy, (req, res) => {
  try {
    res.status(201).json({ medicine: addMedicine(req.body) });
  } catch (err) {
    handle(res, err);
  }
});

pharmacyRouter.patch('/medicines/:id', requireAuth, isPharmacy, (req, res) => {
  try {
    res.json({ medicine: updateMedicine(req.params.id, req.body) });
  } catch (err) {
    handle(res, err);
  }
});

pharmacyRouter.post('/medicines/:id/restock', requireAuth, isPharmacy, (req, res) => {
  try {
    res.json({ medicine: restockMedicine(req.params.id, Number(req.body.amount)) });
  } catch (err) {
    handle(res, err);
  }
});

pharmacyRouter.post('/dispense', requireAuth, isPharmacy, (req, res) => {
  try {
    res.status(201).json(dispenseMedicine(req.profile!.id, req.body));
  } catch (err) {
    handle(res, err);
  }
});

pharmacyRouter.get('/dispenses', requireAuth, canView, (_req, res) => {
  res.json({ dispenses: listDispenses() });
});

pharmacyRouter.get('/prescriptions', requireAuth, canView, (_req, res) => {
  res.json({ prescriptions: listPrescriptions() });
});

// Preview drug/allergy safety warnings before dispensing.
pharmacyRouter.get('/safety-check', requireAuth, isPharmacy, (req, res) => {
  const patientId = req.query.patientId as string | undefined;
  const medicineId = req.query.medicineId as string | undefined;
  const med = medicineId
    ? (db.prepare('SELECT name FROM medicines WHERE id = ?').get(medicineId) as { name: string } | undefined)
    : undefined;
  res.json({ warnings: med ? checkSafety(patientId, med.name) : [] });
});
