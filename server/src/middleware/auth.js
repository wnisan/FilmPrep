import { createHttpError } from '../utils/httpError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Требует Authorization: Bearer <accessToken>.
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(createHttpError(401, 'UNAUTHORIZED', 'Missing access token'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return next(createHttpError(401, 'UNAUTHORIZED', 'Invalid or expired access token'));
  }
}

/**
 * Требует одну из ролей: requireRole('admin') или requireRole('admin', 'learner').
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(createHttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    }
    if (!roles.includes(req.user.role)) {
      return next(createHttpError(403, 'FORBIDDEN', 'Insufficient permissions'));
    }
    return next();
  };
}
