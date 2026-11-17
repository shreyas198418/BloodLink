import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export type UserRole = 'ADMIN' | 'STAFF';

export interface SessionUser {
  id: string;
  uid: string | null;
  email: string;
  fullName: string;
  role: UserRole;
  bloodBankId: string | null;
}

export interface AuthRequest extends Request {
  user?: SessionUser;
}

export const SESSION_COOKIE_NAME = 'bloodlink_session';

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'bloodlink-dev-hmac-secret-do-not-use-in-prod';
}

export function signSessionToken(payload: {
  userId: string;
  email: string;
  role: UserRole;
  exp: number;
}): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(
  token: string,
): { userId: string; email: string; role: UserRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!decoded.userId || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export async function upsertFirebaseUser(
  uid: string,
  email: string,
  displayName?: string,
): Promise<SessionUser> {
  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));

  if (existingByEmail.length > 0) {
    const found = existingByEmail[0];
    if (!found.uid) {
      const updated = await db
        .update(users)
        .set({ uid, fullName: displayName || found.fullName })
        .where(eq(users.id, found.id))
        .returning();
      const u = updated[0];
      return {
        id: u.id,
        uid: u.uid,
        email: u.email,
        fullName: u.fullName,
        role: u.role as UserRole,
        bloodBankId: u.bloodBankId,
      };
    }
    return {
      id: found.id,
      uid: found.uid,
      email: found.email,
      fullName: found.fullName,
      role: found.role as UserRole,
      bloodBankId: found.bloodBankId,
    };
  }

  const allUsers = await db.select({ id: users.id }).from(users);
  const assignedRole: UserRole = allUsers.length <= 3 ? 'ADMIN' : 'STAFF';

  const inserted = await db
    .insert(users)
    .values({
      uid,
      email: email.toLowerCase(),
      fullName: displayName || email.split('@')[0],
      role: assignedRole,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: email.toLowerCase(),
      },
    })
    .returning();

  const u = inserted[0];
  return {
    id: u.id,
    uid: u.uid,
    email: u.email,
    fullName: u.fullName,
    role: u.role as UserRole,
    bloodBankId: u.bloodBankId,
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : cookieToken;

    if (!rawToken) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    // 1. Check local HMAC-signed session token
    const sessionPayload = verifySessionToken(rawToken);
    if (sessionPayload) {
      const found = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionPayload.userId));
      if (found.length === 0 || !found[0].isActive) {
        return res.status(401).json({ error: 'Account is inactive or not found.' });
      }
      const u = found[0];
      req.user = {
        id: u.id,
        uid: u.uid,
        email: u.email,
        fullName: u.fullName,
        role: u.role as UserRole,
        bloodBankId: u.bloodBankId,
      };
      return next();
    }

    // 2. Otherwise verify Firebase ID Token (Google Sign-In)
    const decoded = await adminAuth.verifyIdToken(rawToken);
    if (!decoded.email) {
      return res.status(401).json({ error: 'Firebase token missing email claim.' });
    }
    const syncedUser = await upsertFirebaseUser(
      decoded.uid,
      decoded.email,
      decoded.name,
    );
    req.user = syncedUser;
    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired credentials.' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires ${allowedRoles.join(' or ')} role.`,
      });
    }
    return next();
  };
};
