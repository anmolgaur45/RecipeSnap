import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Verifies Supabase access tokens locally via the project JWKS (ES256).
// No shared secret, no per-request network call (jose caches the key set).

const SUPABASE_URL = process.env.SUPABASE_URL;
const ISSUER = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : '';
const jwks = SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  : null;

export interface AuthClaims {
  sub: string;
  email?: string;
  role?: string;
}

export async function verifyAccessToken(token: string): Promise<AuthClaims> {
  if (!jwks) throw new Error('SUPABASE_URL not configured');
  const { payload } = await jwtVerify(token, jwks, {
    issuer: ISSUER,
    audience: 'authenticated',
  });
  if (typeof payload.sub !== 'string') throw new Error('token missing sub');
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    role: typeof payload.role === 'string' ? payload.role : undefined,
  };
}

/** Express middleware: require a valid Supabase bearer token; sets req.userId. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }
  try {
    const claims = await verifyAccessToken(token);
    req.userId = claims.sub;
    req.userEmail = claims.email;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
