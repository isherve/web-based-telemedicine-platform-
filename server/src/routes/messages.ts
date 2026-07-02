import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listMessages, sendMessage } from '../services/messageService.js';
import { ServiceError } from '../services/consultationService.js';

export const messageRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

messageRouter.get('/:consultationId', requireAuth, (req, res) => {
  try {
    res.json({
      messages: listMessages(req.profile!.id, req.profile!.is_doctor === 1, req.params.consultationId),
    });
  } catch (err) {
    handle(res, err);
  }
});

messageRouter.post('/:consultationId', requireAuth, (req, res) => {
  try {
    res.json({
      message: sendMessage(req.profile!.id, req.profile!.is_doctor === 1, req.params.consultationId, req.body),
    });
  } catch (err) {
    handle(res, err);
  }
});
