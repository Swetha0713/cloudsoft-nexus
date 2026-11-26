import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { AppError } from '../middleware/errorhandler.js';
import { protect } from '../middleware/authMiddleware.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

const toSlug = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';

const signTokens = (user) => {
  const payload = {
    id: user._id.toString(),
    role: user.role,
    tenantId: user.tenantId._id ? user.tenantId._id.toString() : user.tenantId.toString(),
    name: user.name,
    email: user.email,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

  const refreshToken = jwt.sign({ id: payload.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  });

  return { accessToken, refreshToken };
};

// POST /api/auth/register-tenant (Public self-serve company onboarding)
router.post('/register-tenant', async (req, res, next) => {
  const { companyName, name, email, password } = req.body;
  if (!companyName || !name || !email || !password) {
    return next(new AppError('Company name, full name, email, and password are required', 400));
  }

  if (!PASSWORD_REGEX.test(password)) {
    return next(
      new AppError(
        'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol',
        400
      )
    );
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return next(new AppError('An account with this email already exists', 409));
  }

  let slug = toSlug(companyName);
  const existingSlug = await Tenant.findOne({ slug });
  if (existingSlug) {
    slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const tenant = await Tenant.create({
    name: companyName.trim(),
    slug,
    planTier: 'Standard',
    isActive: true,
  });

  let user;
  try {
    user = await User.create({
      tenantId: tenant._id,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: password, // Hashed automatically by pre-save hook
      role: 'TenantAdmin', // Never accept role from client
      isActive: true,
    });
  } catch (err) {
    await Tenant.findByIdAndDelete(tenant._id); // Prevent orphaned tenant
    return next(err);
  }

  tenant.ownerUserId = user._id;
  await tenant.save();

  const populatedUser = await User.findById(user._id).populate(
    'tenantId',
    'name slug planTier isActive'
  );

  const { accessToken, refreshToken } = signTokens(populatedUser);
  populatedUser.refreshTokenHash = await bcrypt.hash(refreshToken, 8);
  await populatedUser.save();

  await logAudit({
    tenantId: tenant._id,
    actorId: user._id,
    actorRole: 'TenantAdmin',
    action: 'TENANT_REGISTERED',
    resourceType: 'Tenant',
    resourceId: tenant._id,
    details: { companyName: tenant.name, slug: tenant.slug, ownerEmail: user.email },
  });

  res.status(201).json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: populatedUser._id,
      name: populatedUser.name,
      email: populatedUser.email,
      role: populatedUser.role,
      tenant: populatedUser.tenantId,
    },
  });
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Please provide both email and password', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('+passwordHash')
    .populate('tenantId', 'name slug planTier isActive');

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password', 401));
  }

  if (user.isActive === false || user.tenantId?.isActive === false) {
    return next(new AppError('Account or workspace has been suspended', 403));
  }

  const { accessToken, refreshToken } = signTokens(user);

  user.refreshTokenHash = await bcrypt.hash(refreshToken, 8);
  await user.save();

  await logAudit({
    tenantId: user.tenantId._id,
    actorId: user._id,
    actorRole: user.role,
    action: 'USER_LOGIN',
    resourceType: 'Auth',
    resourceId: user._id,
    details: { email: user.email },
  });

  res.status(200).json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant: user.tenantId,
    },
  });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return next(new AppError('Refresh token required', 400));
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return next(new AppError('Invalid or expired refresh token', 401));
  }

  const user = await User.findById(decoded.id)
    .select('+refreshTokenHash')
    .populate('tenantId', 'name slug planTier isActive');

  if (!user || !user.refreshTokenHash) {
    return next(new AppError('Session revoked', 401));
  }

  if (user.isActive === false || user.tenantId?.isActive === false) {
    return next(new AppError('Account or workspace has been suspended', 403));
  }

  const isMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!isMatch) {
    return next(new AppError('Refresh token mismatch', 401));
  }

  const tokens = signTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 8);
  await user.save();

  res.status(200).json({
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// POST /api/auth/logout
router.post('/logout', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { refreshTokenHash: null });
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// POST /api/auth/change-password
router.post('/change-password', protect, async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return next(new AppError('Current and new passwords are required', 400));
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    return next(
      new AppError(
        'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol',
        400
      )
    );
  }

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user || !(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect', 401));
  }

  user.passwordHash = newPassword; // Hashed automatically by pre-save hook
  user.refreshTokenHash = null; // Revoke existing sessions
  await user.save();

  await logAudit({
    tenantId: user.tenantId,
    actorId: user._id,
    actorRole: user.role,
    action: 'PASSWORD_CHANGED',
    resourceType: 'Auth',
    resourceId: user._id,
    details: { email: user.email },
  });

  res.status(200).json({ success: true, message: 'Password updated. Please sign in again.' });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res, next) => {
  const user = await User.findById(req.user.id).populate('tenantId', 'name slug planTier isActive');
  if (!user || user.isActive === false || user.tenantId?.isActive === false) {
    return next(new AppError('Account or workspace is no longer active', 403));
  }

  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant: user.tenantId,
    },
  });
});

export default router;