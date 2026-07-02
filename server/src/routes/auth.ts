import { Router } from 'express';
import {
  AuthError,
  changePassword,
  login,
  logout,
  registerDoctor,
  registerPatient,
  registerStaff,
  toPublicProfile,
  updateMyProfile,
} from '../services/authService.js';
import { requestPasswordReset, resetPassword } from '../services/emailService.js';
import { getSessionToken, requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

function handle(res: import('express').Response, err: unknown) {
  if (err instanceof AuthError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}

authRouter.post('/register/patient', (req, res) => {
  try {
    res.json(registerPatient(req.body));
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/register/doctor', (req, res) => {
  try {
    res.json(registerDoctor(req.body));
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/register/staff', (req, res) => {
  try {
    res.json(registerStaff(req.body));
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/login', (req, res) => {
  try {
    res.json(login(req.body?.identifier, req.body?.password));
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/logout', (req, res) => {
  logout(getSessionToken(req));
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ profile: toPublicProfile(req.profile!) });
});

authRouter.patch('/me', requireAuth, (req, res) => {
  try {
    res.json({ profile: updateMyProfile(req.profile!, req.body ?? {}) });
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/change-password', requireAuth, (req, res) => {
  try {
    changePassword(req.profile!, req.body?.currentPassword, req.body?.newPassword);
    res.json({ ok: true });
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/reset/request', (req, res) => {
  try {
    res.json(requestPasswordReset(req.body?.identifier));
  } catch (err) {
    handle(res, err);
  }
});

authRouter.post('/reset/confirm', (req, res) => {
  try {
    resetPassword(req.body?.identifier, req.body?.otp, req.body?.newPassword);
    res.json({ ok: true });
  } catch (err) {
    handle(res, err);
  }
});
