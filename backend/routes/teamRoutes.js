import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import '../models/Tenant.js';
import { Invitation } from '../models/Invitation.js';
import { AppError } from '../middleware/errorhandler.js';
import { protect, authorize, buildTenantFilter } from '../middleware/authMiddleware.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
const INVITABLE_ROLES = ['TenantAdmin', 'Engineer', 'ClientViewer'];

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

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

// GET /api/team/members (Tenant-isolated member list)
router.get('/members', protect, authorize('SuperAdmin', 'TenantAdmin'), async (req, res) => {
  const filter = buildTenantFilter(req);
  const members = await User.find(filter)
    .populate('tenantId', 'name slug')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: members.length, members });
});

// GET /api/team/invites (Pending non-expired invites for the workspace)
router.get('/invites', protect, authorize('SuperAdmin', 'TenantAdmin'), async (req, res) => {
  const filter = {
    ...buildTenantFilter(req),
    status: 'Pending',
    expiresAt: { $gt: new Date() },
  };

  const invites = await Invitation.find(filter)
    .populate('tenantId', 'name slug')
    .populate('invitedBy', 'name email')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: invites.length, invites });
});

// POST /api/team/invites (Generate single-use 72h invite link)
router.post('/invites', protect, authorize('SuperAdmin', 'TenantAdmin'), async (req, res, next) => {
  const { email, role = 'Engineer', tenantId: bodyTenantId } = req.body;

  if (!email) {
    return next(new AppError('Email is required', 400));
  }

  if (!INVITABLE_ROLES.includes(role)) {
    return next(new AppError(`Invalid role. Must be one of: ${INVITABLE_ROLES.join(', ')}`, 400));
  }

  const targetTenantId =
    req.user.role === 'SuperAdmin' ? bodyTenantId || req.user.tenantId : req.user.tenantId;

  const normalizedEmail = email.toLowerCase().trim();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return next(new AppError('A user with this email already exists', 409));
  }

  // Revoke any previous pending invite for this email in this tenant
  await Invitation.updateMany(
    { tenantId: targetTenantId, email: normalizedEmail, status: 'Pending' },
    { $set: { status: 'Revoked' } }
  );

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const invite = await Invitation.create({
    tenantId: targetTenantId,
    email: normalizedEmail,
    role,
    tokenHash,
    invitedBy: req.user.id,
    status: 'Pending',
    expiresAt,
  });

  const populated = await invite.populate([
    { path: 'tenantId', select: 'name slug' },
    { path: 'invitedBy', select: 'name email' },
  ]);

  const clientBase = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
  const inviteUrl = `${clientBase}/join?token=${rawToken}`;

  await logAudit({
    tenantId: targetTenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'TEAM_INVITE_CREATED',
    resourceType: 'Invitation',
    resourceId: invite._id,
    details: { email: normalizedEmail, role },
  });

  res.status(201).json({ success: true, invite: populated, inviteUrl });
});

// DELETE /api/team/invites/:id (Revoke pending invite)
router.delete('/invites/:id', protect, authorize('SuperAdmin', 'TenantAdmin'), async (req, res, next) => {
  const invite = await Invitation.findById(req.params.id);
  if (!invite) {
    return next(new AppError('Invitation not found', 404));
  }

  if (req.user.role !== 'SuperAdmin' && invite.tenantId.toString() !== req.user.tenantId) {
    return next(new AppError("Forbidden: cannot revoke another tenant's invitation", 403));
  }

  invite.status = 'Revoked';
  await invite.save();

  await logAudit({
    tenantId: invite.tenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'TEAM_INVITE_REVOKED',
    resourceType: 'Invitation',
    resourceId: invite._id,
    details: { email: invite.email, role: invite.role },
  });

  res.status(200).json({ success: true, message: 'Invitation revoked' });
});

// PATCH /api/team/members/:id/status (Suspend or reactivate a teammate)
router.patch('/members/:id/status', protect, authorize('SuperAdmin', 'TenantAdmin'), async (req, res, next) => {
  const { isActive } = req.body;
  if (typeof isActive !== 'boolean') {
    return next(new AppError('isActive boolean is required', 400));
  }

  if (req.params.id === req.user.id) {
    return next(new AppError('You cannot suspend your own account', 400));
  }

  const member = await User.findById(req.params.id);
  if (!member) {
    return next(new AppError('Member not found', 404));
  }

  if (member.role === 'SuperAdmin') {
    return next(new AppError('Cannot modify SuperAdmin account status', 403));
  }

  if (req.user.role !== 'SuperAdmin' && member.tenantId.toString() !== req.user.tenantId) {
    return next(new AppError("Forbidden: cannot modify another tenant's member", 403));
  }

  member.isActive = isActive;
  if (!isActive) {
    member.refreshTokenHash = null; // Immediately revoke active sessions
  }
  await member.save();

  const populated = await member.populate('tenantId', 'name slug');

  await logAudit({
    tenantId: member.tenantId._id || member.tenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: isActive ? 'TEAM_MEMBER_ACTIVATED' : 'TEAM_MEMBER_SUSPENDED',
    resourceType: 'User',
    resourceId: member._id,
    details: { email: member.email, role: member.role, isActive },
  });

  res.status(200).json({ success: true, member: populated });
});

// GET /api/team/invite-info/:token (Public — preview workspace details before joining)
router.get('/invite-info/:token', async (req, res, next) => {
  const tokenHash = hashToken(req.params.token);
  const invite = await Invitation.findOne({
    tokenHash,
    status: 'Pending',
    expiresAt: { $gt: new Date() },
  }).populate('tenantId', 'name slug');

  if (!invite) {
    return next(new AppError('Invitation link is invalid, revoked, or expired', 404));
  }

  res.status(200).json({
    success: true,
    invite: {
      email: invite.email,
      role: invite.role,
      companyName: invite.tenantId?.name || 'CloudSoft Workspace',
      expiresAt: invite.expiresAt,
    },
  });
});

// POST /api/team/accept-invite (Public — create account from single-use invite token)
router.post('/accept-invite', async (req, res, next) => {
  const { token, name, password } = req.body;
  if (!token || !name || !password) {
    return next(new AppError('Invite token, full name, and password are required', 400));
  }

  if (!PASSWORD_REGEX.test(password)) {
    return next(
      new AppError(
        'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol',
        400
      )
    );
  }

  const tokenHash = hashToken(token);
  const invite = await Invitation.findOne({
    tokenHash,
    status: 'Pending',
    expiresAt: { $gt: new Date() },
  });

  if (!invite) {
    return next(new AppError('Invitation link is invalid, revoked, or expired', 400));
  }

  const existingUser = await User.findOne({ email: invite.email });
  if (existingUser) {
    return next(new AppError('An account with this email already exists', 409));
  }

  const user = await User.create({
    tenantId: invite.tenantId,
    name: name.trim(),
    email: invite.email,
    passwordHash: password, // Hashed automatically by pre-save hook
    role: invite.role, // Locked to the invited role
    isActive: true,
  });

  invite.status = 'Accepted';
  await invite.save();

  const populatedUser = await User.findById(user._id).populate(
    'tenantId',
    'name slug planTier isActive'
  );

  const { accessToken, refreshToken } = signTokens(populatedUser);
  populatedUser.refreshTokenHash = await bcrypt.hash(refreshToken, 8);
  await populatedUser.save();

  await logAudit({
    tenantId: invite.tenantId,
    actorId: user._id,
    actorRole: user.role,
    action: 'TEAM_INVITE_ACCEPTED',
    resourceType: 'User',
    resourceId: user._id,
    details: { email: user.email, role: user.role },
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

export default router;