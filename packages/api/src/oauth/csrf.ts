import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { isEnabled } from '~/utils/common';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
export const OAUTH_CSRF_MAX_AGE = 10 * 60 * 1000;

export const OAUTH_SESSION_COOKIE = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
export const OAUTH_SESSION_COOKIE_PATH = '/api';
const OAUTH_TOKEN_LENGTH_BYTES = 16;
const OAUTH_SCRYPT_OPTS = { N: 1 << 14, r: 8, p: 1, maxmem: 32 * 1024 * 1024 } as const;

/**
 * Determines if secure cookies should be used.
 * SESSION_COOKIE_SECURE=true/false explicitly overrides the environment heuristic.
 * Returns `true` in production unless DOMAIN_SERVER uses a localhost-style hostname.
 * This allows cookies to work on localhost during local development
 * even when `NODE_ENV=production` (common in Docker Compose setups).
 */
export function shouldUseSecureCookie(): boolean {
  const secureOverride = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (secureOverride === 'true' || secureOverride === 'false') {
    return isEnabled(secureOverride);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const domainServer = process.env.DOMAIN_SERVER || '';

  let hostname = '';
  if (domainServer) {
    try {
      const normalized = /^https?:\/\//i.test(domainServer)
        ? domainServer
        : `http://${domainServer}`;
      const url = new URL(normalized);
      hostname = (url.hostname || '').toLowerCase();
    } catch {
      hostname = domainServer.toLowerCase();
    }
  }

  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost');

  return isProduction && !isLocalhost;
}

/**
 * Generates a deterministic opaque binding token for OAuth CSRF/session cookies.
 *
 * We use scrypt instead of a fast hash so CodeQL does not classify the derived
 * value as `js/insufficient-password-hash` when the input contains user/server ids.
 */
export function generateOAuthCsrfToken(flowId: string, secret?: string): string {
  const signingKey = secret || process.env.JWT_SECRET;
  if (!signingKey) {
    throw new Error('JWT_SECRET is required for OAuth CSRF token generation');
  }
  return crypto
    .scryptSync(String(flowId), signingKey, OAUTH_TOKEN_LENGTH_BYTES, OAUTH_SCRYPT_OPTS)
    .toString('hex');
}

function getOAuthBindingSigningKey(secret?: string): string {
  const signingKey = secret || process.env.JWT_SECRET;
  if (!signingKey) {
    throw new Error('JWT_SECRET is required for OAuth CSRF token generation');
  }
  return signingKey;
}

export function getOAuthCookieBindingValue(subject: string, secret?: string): string {
  return crypto
    .createHmac('sha256', getOAuthBindingSigningKey(secret))
    .update(generateOAuthCsrfToken(subject, secret), 'utf8')
    .digest('base64url');
}

function getCookieBindingValue(subject: string): string {
  return getOAuthCookieBindingValue(subject);
}

/**
 * Sets a SameSite=Lax CSRF cookie bound to a specific OAuth flow.
 *
 * The cookie stores an HMAC-wrapped binding derived from the scrypt token.
 * This keeps the browser-visible value opaque while preserving deterministic
 * server-side verification. The cookie is httpOnly + Secure (in prod) +
 * SameSite=Lax, exactly per OWASP CSRF guidance.
 */
export function setOAuthCsrfCookie(res: Response, flowId: string, cookiePath: string): void {
  res.cookie(OAUTH_CSRF_COOKIE, getCookieBindingValue(flowId), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_CSRF_MAX_AGE,
    path: cookiePath,
  });
}

/**
 * Validates the per-flow CSRF cookie against the expected HMAC.
 * Uses timing-safe comparison and always clears the cookie to prevent replay.
 */
export function validateOAuthCsrf(
  req: Request,
  res: Response,
  flowId: string,
  cookiePath: string,
): boolean {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_CSRF_COOKIE];
  res.clearCookie(OAUTH_CSRF_COOKIE, { path: cookiePath });
  if (!cookie) {
    return false;
  }
  const expected = getCookieBindingValue(flowId);
  if (cookie.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}

/**
 * Express middleware that sets the OAuth session cookie after JWT authentication.
 * Chain after requireJwtAuth on routes that precede an OAuth redirect (e.g., reinitialize, bind).
 */
export function setOAuthSession(req: Request, res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id?: string } }).user;
  if (user?.id && !(req.cookies as Record<string, string> | undefined)?.[OAUTH_SESSION_COOKIE]) {
    setOAuthSessionCookie(res, user.id);
  }
  next();
}

/**
 * Sets a SameSite=Lax session cookie that binds the browser to the authenticated userId.
 *
 * Same opaque binding approach as `setOAuthCsrfCookie`: the cookie stores an
 * HMAC-wrapped binding, not the raw scrypt-derived token.
 */
export function setOAuthSessionCookie(res: Response, userId: string): void {
  res.cookie(OAUTH_SESSION_COOKIE, getCookieBindingValue(userId), {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: 'lax',
    maxAge: OAUTH_SESSION_MAX_AGE,
    path: OAUTH_SESSION_COOKIE_PATH,
  });
}

/** Validates the session cookie against the expected userId using timing-safe comparison */
export function validateOAuthSession(req: Request, userId: string): boolean {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_SESSION_COOKIE];
  if (!cookie) {
    return false;
  }
  const expected = getCookieBindingValue(userId);
  if (cookie.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
