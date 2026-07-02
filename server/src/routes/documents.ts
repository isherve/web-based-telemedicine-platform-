import { Router } from 'express';
import { requireAuth, requireDoctor } from '../middleware/auth.js';
import { createDocument, listDocuments } from '../services/documentService.js';
import { ServiceError } from '../services/consultationService.js';

export const documentRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

documentRouter.get('/', requireAuth, (req, res) => {
  res.json({ documents: listDocuments(req.profile!.id, req.profile!.is_doctor === 1) });
});

documentRouter.post('/:consultationId', requireAuth, requireDoctor, (req, res) => {
  try {
    res.status(201).json({
      document: createDocument(req.profile!.id, req.params.consultationId, req.body),
    });
  } catch (err) {
    handle(res, err);
  }
});
