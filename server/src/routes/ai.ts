import { Router } from 'express';
import { requireAuth, requireDoctor } from '../middleware/auth.js';
import { ServiceError } from '../services/consultationService.js';
import {
  runDoctorSuggestions,
  runGeneralAssistant,
  runPatientAssistant,
  runTriageChat,
} from '../services/aiChatService.js';

export const aiRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

/** Conversational triage guide (patient only). */
aiRouter.post('/triage-chat', requireAuth, async (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    const { messages = [], draft = {}, language = 'en' } = req.body ?? {};
    const result = await runTriageChat(messages, draft, language === 'rw' ? 'rw' : 'en');
    res.json(result);
  } catch (err) {
    handle(res, err);
  }
});

/** Patient health assistant during active consultation. */
aiRouter.post('/patient-assistant', requireAuth, async (req, res) => {
  if (req.profile!.is_doctor) return res.status(403).json({ error: 'Patients only.' });
  try {
    const { consultationId, messages = [], question, language = 'en' } = req.body ?? {};
    if (!consultationId || !question?.trim()) {
      return res.status(400).json({ error: 'consultationId and question are required.' });
    }
    const result = await runPatientAssistant(
      req.profile!.id,
      consultationId,
      messages,
      question.trim(),
      language === 'rw' ? 'rw' : 'en'
    );
    res.json(result);
  } catch (err) {
    handle(res, err);
  }
});

/** Global role-aware assistant (any authenticated user, any page). */
aiRouter.post('/general', requireAuth, async (req, res) => {
  try {
    const { page = 'dashboard', messages = [], question, language = 'en' } = req.body ?? {};
    if (!question?.trim()) return res.status(400).json({ error: 'question is required.' });
    const result = await runGeneralAssistant(
      req.profile!,
      page,
      messages,
      question.trim(),
      language === 'rw' ? 'rw' : 'en'
    );
    res.json(result);
  } catch (err) {
    handle(res, err);
  }
});

aiRouter.post('/doctor-suggestions', requireAuth, requireDoctor, async (req, res) => {
  try {
    const { consultationId, language = 'en' } = req.body ?? {};
    if (!consultationId) return res.status(400).json({ error: 'consultationId is required.' });
    const result = await runDoctorSuggestions(
      req.profile!.id,
      consultationId,
      language === 'rw' ? 'rw' : 'en'
    );
    res.json(result);
  } catch (err) {
    handle(res, err);
  }
});
