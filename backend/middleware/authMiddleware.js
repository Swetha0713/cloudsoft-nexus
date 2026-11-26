import jwt from 'jsonwebtoken';
import { AppError } from './errorhandler.js';

export const protect = (req, res, next) => {
  let token = null;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query.token) {
    // Used by browser EventSource (SSE) connections
    token = req.query.token;
  }

  if (!token) {
    return next(new AppError('Not authorized: missing access token', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = {
      id: decoded.id,
      role: decoded.role,
      tenantId: decoded.tenantId,
      name: decoded.name,
      email: decoded.email,
    };
    next();
  } catch (error) {
    return next(new AppError('Not authorized: invalid or expired token', 401));
  }
};

export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(new AppError(`Forbidden: role '${req.user?.role}' cannot access this resource`, 403));
    }
    next();
  };
};

// Enforces strict multi-tenant data isolation at the query level
// Enforces strict multi-tenant data isolation at the query level
export const buildTenantFilter = (req) => {
  if (req.user.role === 'SuperAdmin') {
    return req.query.tenantId ? { tenantId: req.query.tenantId } : {};
  }
  // TenantAdmin, Engineer, and ClientViewer are strictly locked to their own tenant
  return { tenantId: req.user.tenantId };
};