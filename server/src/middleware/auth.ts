import type { NextFunction, Request, Response } from 'express';
import { getProfileBySession, roleOf, type ProfileRow, type Role } from '../services/authService.js';

// Augment Express Request with the authenticated profile.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      profile?: ProfileRow;
    }
  }
}

/** Reads the session token from the Authorization: Bearer <token> header. */
export function getSessionToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return undefined;
}

/**
 * Requires a valid session. All access control in Gara is enforced here in the
 * service/middleware layer, scoped to the session user id (there is no RLS in
 * SQLite — this is the intentional replacement for the original permissive RLS).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const profile = getProfileBySession(getSessionToken(req));
  if (!profile) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  req.profile = profile;
  next();
}

/** Requires the authenticated user to be a doctor. */
export function requireDoctor(req: Request, res: Response, next: NextFunction): void {
  if (!req.profile || req.profile.is_doctor !== 1) {
    res.status(403).json({ error: 'Doctor access required.' });
    return;
  }
  next();
}

/** Requires the authenticated user to hold one of the given roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.profile || !roles.includes(roleOf(req.profile))) {
      res.status(403).json({ error: `Requires role: ${roles.join(' or ')}.` });
      return;
    }
    next();
  };
}
