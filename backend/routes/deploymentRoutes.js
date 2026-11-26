import express from 'express';
import { Deployment } from '../models/Deployment.js';
import '../models/Tenant.js';
import '../models/User.js';
import { AppError } from '../middleware/errorhandler.js';
import { protect, authorize, buildTenantFilter } from '../middleware/authMiddleware.js';
import { logAudit } from '../utils/auditLogger.js';
import { broadcastEvent } from '../utils/sseHub.js';

const router = express.Router();

// Finite State Machine (FSM) transition rules
const ALLOWED_TRANSITIONS = {
  Queued: ['Provisioning'],
  Provisioning: ['HealthCheck', 'Rollback'],
  HealthCheck: ['Live', 'Rollback'],
  Live: ['Rollback'],
  Rollback: ['Queued'],
};

// GET /api/deployments (Tenant-isolated)
router.get('/', protect, async (req, res) => {
  const filter = buildTenantFilter(req);
  if (req.query.status) filter.status = req.query.status;

  const deployments = await Deployment.find(filter)
    .populate('tenantId', 'name slug planTier')
    .populate('triggeredBy', 'name email role')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: deployments.length,
    deployments,
  });
});

// POST /api/deployments (SuperAdmin, TenantAdmin & Engineer)
router.post('/', protect, authorize('SuperAdmin', 'TenantAdmin', 'Engineer'), async (req, res, next) => {
  const { tenantId, serviceName, version, environment } = req.body;
  const targetTenantId =
    req.user.role === 'SuperAdmin' ? tenantId || req.user.tenantId : req.user.tenantId;

  if (!targetTenantId || !serviceName || !version) {
    return next(new AppError('serviceName and version are required', 400));
  }

  const deployment = await Deployment.create({
    tenantId: targetTenantId,
    serviceName,
    version,
    environment: environment || 'Staging',
    status: 'Queued',
    triggeredBy: req.user.id,
  });

  const populated = await deployment.populate([
    { path: 'tenantId', select: 'name slug planTier' },
    { path: 'triggeredBy', select: 'name email role' },
  ]);

  await logAudit({
    tenantId: targetTenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'DEPLOYMENT_CREATED',
    resourceType: 'Deployment',
    resourceId: deployment._id,
    details: { serviceName, version, environment: deployment.environment },
  });

  broadcastEvent('deployment_created', populated, targetTenantId);

  res.status(201).json({ success: true, deployment: populated });
});

// PATCH /api/deployments/:id/transition (FSM-enforced stage shift)
router.patch('/:id/transition', protect, authorize('SuperAdmin', 'TenantAdmin', 'Engineer'), async (req, res, next) => {
  const { nextStatus, note } = req.body;
  if (!nextStatus) {
    return next(new AppError('nextStatus is required', 400));
  }

  const deployment = await Deployment.findById(req.params.id);
  if (!deployment) {
    return next(new AppError('Deployment not found', 404));
  }

  if (req.user.role !== 'SuperAdmin' && deployment.tenantId.toString() !== req.user.tenantId) {
    return next(new AppError("Forbidden: cannot modify another tenant's deployment", 403));
  }

  const currentStatus = deployment.status;
  const validNextStates = ALLOWED_TRANSITIONS[currentStatus] || [];

  if (!validNextStates.includes(nextStatus)) {
    return next(
      new AppError(
        `Invalid FSM transition: cannot move from '${currentStatus}' to '${nextStatus}'. Allowed: [${validNextStates.join(', ')}]`,
        400
      )
    );
  }

  deployment.status = nextStatus;
  deployment.stateHistory.push({
    from: currentStatus,
    to: nextStatus,
    changedBy: req.user.id,
    note: note || `Transitioned to ${nextStatus}`,
  });

  await deployment.save();

  const populated = await deployment.populate([
    { path: 'tenantId', select: 'name slug planTier' },
    { path: 'triggeredBy', select: 'name email role' },
  ]);

  await logAudit({
    tenantId: deployment.tenantId._id || deployment.tenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'DEPLOYMENT_STAGE_CHANGED',
    resourceType: 'Deployment',
    resourceId: deployment._id,
    details: { from: currentStatus, to: nextStatus, serviceName: deployment.serviceName },
  });

  broadcastEvent('deployment_updated', populated, deployment.tenantId._id || deployment.tenantId);

  res.status(200).json({ success: true, deployment: populated });
});

export default router;