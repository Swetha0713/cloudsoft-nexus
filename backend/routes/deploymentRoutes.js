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

// POST /api/deployments (SuperAdmin & Engineer only)
router.post('/', protect, authorize('SuperAdmin', 'Engineer'), async (req, res, next) => {
  const { tenantId, serviceName, version, environment } = req.body;
  if (!tenantId || !serviceName || !version) {
    return next(new AppError('tenantId, serviceName, and version are required', 400));
  }

  const deployment = await Deployment.create({
    tenantId,
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
    tenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'DEPLOYMENT_CREATED',
    resourceType: 'Deployment',
    resourceId: deployment._id,
    details: { serviceName, version, environment: deployment.environment },
  });

  broadcastEvent('deployment_created', populated, tenantId);

  res.status(201).json({ success: true, deployment: populated });
});

// PATCH /api/deployments/:id/transition (FSM-enforced stage shift)
router.patch('/:id/transition', protect, authorize('SuperAdmin', 'Engineer'), async (req, res, next) => {
  const { nextStatus, note } = req.body;
  if (!nextStatus) {
    return next(new AppError('nextStatus is required', 400));
  }

  const deployment = await Deployment.findById(req.params.id);
  if (!deployment) {
    return next(new AppError('Deployment not found', 404));
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