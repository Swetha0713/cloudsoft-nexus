import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import '../models/Tenant.js';
import { AppError } from '../middleware/errorhandler.js';
import { protect } from '../middleware/authMiddleware.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

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

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(new AppError('Please provide both email and password', 400));
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordHash')
    .populate('tenantId', 'name slug planTier');

  if (!user || !(await user.comparePassword(password))) {
    return next(new AppError('Invalid email or password', 401));
  }

  const { accessToken, refreshToken } = signTokens(user);

  // Store hashed refresh token for secure rotation
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
    .populate('tenantId', 'name slug planTier');

  if (!user || !user.refreshTokenHash) {
    return next(new AppError('Session revoked', 401));
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

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user.id).populate('tenantId', 'name slug planTier');
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