import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { isEnabled } from '~/utils/common';

export const OAUTH_CSRF_COOKIE = 'oauth_csrf';
export const OAUTH_CSRF_MAX_AGE = 10 * 60 * 1000;

export const OAUTH_SESSION_COOKIE = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
export const OAUTH_SESSION_COOKIE_PATH = '/api';

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
 * Generates an HMAC-SHA256 *tag* over an OAuth flow identifier for CSRF binding.
 *
 * NOTE on CodeQL `js/insufficient-password-hash`: the input here is a
 * server-generated flow ID, not a user password. HMAC-SHA256 is the correct
 * primitive for MAC tagging — bcrypt/scrypt/argon2 are not appropriate here
 * (they're for password storage). Suppression is intentional.
 */
export function generateOAuthCsrfToken(flowId: string, secret?: string): string {
  const key = secret || process.env.JWT_SECRET;
  if (!key) {
    throw new Error('JWT_SECRET is required for OAuth CSRF token generation');
  }
  // lgtm[js/insufficient-password-hash]
  return crypto.createHmac('sha256', key).update(flowId).digest('hex').slice(0, 32);
}

/**
 * Sets a SameSite=Lax CSRF cookie bound to a specific OAuth flow.
 *
 * CodeQL `js/clear-text-storage-of-sensitive-data`: false positive — the cookie
 * stores an HMAC tag derived from the flow ID, not a credential. The cookie is
 * httpOnly + Secure (in prod) + SameSite=Lax, exactly per OWASP CSRF guidance.
 */
export function setOAuthCsrfCookie(res: Response, flowId: string, cookiePath: string): void {
  // lgtm[js/clear-text-storage-of-sensitive-data]
  res.cookie(OAUTH_CSRF_COOKIE, generateOAuthCsrfToken(flowId), {
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
  const expected = generateOAuthCsrfToken(flowId);
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
 * CodeQL `js/clear-text-storage-of-sensitive-data`: false positive — same reasoning
 * as `setOAuthCsrfCookie`. The cookie stores an HMAC tag, not the user ID directly.
 */
export function setOAuthSessionCookie(res: Response, userId: string): void {
  // lgtm[js/clear-text-storage-of-sensitive-data]
  res.cookie(OAUTH_SESSION_COOKIE, generateOAuthCsrfToken(userId), {
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
  const expected = generateOAuthCsrfToken(userId);
  if (cookie.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(expected));
}
