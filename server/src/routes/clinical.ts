import { Router } from 'express';
import type { Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ServiceError } from '../services/consultationService.js';
import { roleOf } from '../services/authService.js';
import {
  recordVitals,
  listVitals,
  createPrescription,
  getPrescription,
  listPrescriptionsByPatient,
  listActivePrescriptions,
  markPrescriptionDispensed,
  createLabOrder,
  listLabOrdersByPatient,
  listAllLabOrders,
  completeLabOrder,
} from '../services/clinicalService.js';

export const clinicalRouter = Router();

function handle(res: Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

/* ----- Vitals ----- */
// Doctor records for any patient; patient records/reads own only.
clinicalRouter.post('/vitals', requireAuth, (req, res) => {
  try {
    const me = req.profile!;
    const role = roleOf(me);
    const patientId = role === 'patient' ? me.id : req.body.patientId;
    res.status(201).json({ vital: recordVitals(me.id, { ...req.body, patientId }) });
  } catch (err) {
    handle(res, err);
  }
});

clinicalRouter.get('/vitals/:patientId', requireAuth, (req, res) => {
  try {
    const me = req.profile!;
    const role = roleOf(me);
    if (role === 'patient' && req.params.patientId !== me.id) {
      throw new ServiceError(403, 'Access denied.');
    }
    res.json({ vitals: listVitals(req.params.patientId) });
  } catch (err) {
    handle(res, err);
  }
});

/* ----- Prescriptions (structured) ----- */
clinicalRouter.post('/prescriptions', requireAuth, requireRole('doctor'), (req, res) => {
  try {
    res.status(201).json(createPrescription(req.profile!.id, req.body));
  } catch (err) {
    handle(res, err);
  }
});

clinicalRouter.get('/prescriptions/active', requireAuth, requireRole('pharmacy', 'doctor', 'finance'), (_req, res) => {
  res.json({ prescriptions: listActivePrescriptions() });
});

clinicalRouter.get('/prescriptions/mine', requireAuth, requireRole('patient'), (req, res) => {
  res.json({ prescriptions: listPrescriptionsByPatient(req.profile!.id) });
});

clinicalRouter.get('/prescriptions/patient/:patientId', requireAuth, requireRole('doctor', 'pharmacy'), (req, res) => {
  res.json({ prescriptions: listPrescriptionsByPatient(req.params.patientId) });
});

clinicalRouter.get('/prescriptions/:id', requireAuth, (req, res) => {
  try {
    res.json({ prescription: getPrescription(req.params.id) });
  } catch (err) {
    handle(res, err);
  }
});

clinicalRouter.post('/prescriptions/:id/dispense', requireAuth, requireRole('pharmacy'), (req, res) => {
  try {
    res.json({ prescription: markPrescriptionDispensed(req.params.id) });
  } catch (err) {
    handle(res, err);
  }
});

/* ----- Lab orders ----- */
clinicalRouter.post('/lab-orders', requireAuth, requireRole('doctor'), (req, res) => {
  try {
    res.status(201).json({ labOrder: createLabOrder(req.profile!.id, req.body) });
  } catch (err) {
    handle(res, err);
  }
});

clinicalRouter.get('/lab-orders/mine', requireAuth, requireRole('patient'), (req, res) => {
  res.json({ labOrders: listLabOrdersByPatient(req.profile!.id) });
});

clinicalRouter.get('/lab-orders', requireAuth, requireRole('doctor'), (req, res) => {
  res.json({ labOrders: listAllLabOrders(req.query.status as string | undefined) });
});

clinicalRouter.get('/lab-orders/patient/:patientId', requireAuth, requireRole('doctor'), (req, res) => {
  res.json({ labOrders: listLabOrdersByPatient(req.params.patientId) });
});

clinicalRouter.post('/lab-orders/:id/complete', requireAuth, requireRole('doctor'), (req, res) => {
  try {
    res.json({ labOrder: completeLabOrder(req.params.id, req.body.result) });
  } catch (err) {
    handle(res, err);
  }
});
