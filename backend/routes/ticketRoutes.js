import express from 'express';
import { Ticket } from '../models/Ticket.js';
import '../models/Tenant.js';
import '../models/User.js';
import { AppError } from '../middleware/errorhandler.js';
import { protect, authorize, buildTenantFilter } from '../middleware/authMiddleware.js';
import { logAudit } from '../utils/auditLogger.js';
import { broadcastEvent } from '../utils/sseHub.js';

const router = express.Router();

const SLA_MINUTES_BY_PRIORITY = {
  P1: 30,
  P2: 120,
  P3: 1440,
};

// GET /api/tickets (Tenant-isolated, sorted by most urgent SLA deadline)
router.get('/', protect, async (req, res) => {
  const filter = buildTenantFilter(req);
  if (req.query.status) filter.status = req.query.status;

  const tickets = await Ticket.find(filter)
    .populate('tenantId', 'name slug planTier')
    .populate('createdBy', 'name email role')
    .populate('assignedTo', 'name email role')
    .sort({ slaDeadline: 1 });

  res.status(200).json({
    success: true,
    count: tickets.length,
    tickets,
  });
});

// POST /api/tickets (Any authenticated role can raise an incident)
router.post('/', protect, async (req, res, next) => {
  const { title, description, priority = 'P2', tenantId: bodyTenantId } = req.body;
  if (!title || !description) {
    return next(new AppError('Title and description are required', 400));
  }

  // Only SuperAdmin can specify another tenantId; all other roles are locked to their JWT tenantId
  const resolvedTenantId =
    req.user.role === 'SuperAdmin' ? bodyTenantId || req.user.tenantId : req.user.tenantId;

  const slaMinutes = SLA_MINUTES_BY_PRIORITY[priority] || 120;
  const slaDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);
  const ticketCode = `CSN-${Math.floor(1000 + Math.random() * 9000)}`;

  const ticket = await Ticket.create({
    tenantId: resolvedTenantId,
    ticketCode,
    title,
    description,
    priority,
    status: 'Open',
    slaDeadline,
    createdBy: req.user.id,
  });

  const populated = await ticket.populate([
    { path: 'tenantId', select: 'name slug planTier' },
    { path: 'createdBy', select: 'name email role' },
  ]);

  await logAudit({
    tenantId: resolvedTenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'TICKET_CREATED',
    resourceType: 'Ticket',
    resourceId: ticket._id,
    details: { ticketCode, priority, title },
  });

  broadcastEvent('ticket_created', populated, resolvedTenantId);

  res.status(201).json({ success: true, ticket: populated });
});

// PATCH /api/tickets/:id/status (SuperAdmin, TenantAdmin & Engineer)
router.patch('/:id/status', protect, authorize('SuperAdmin', 'TenantAdmin', 'Engineer'), async (req, res, next) => {
  const { status } = req.body;
  const allowed = ['Open', 'InProgress', 'Escalated', 'Resolved'];
  if (!allowed.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${allowed.join(', ')}`, 400));
  }

  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) {
    return next(new AppError('Ticket not found', 404));
  }

  if (req.user.role !== 'SuperAdmin' && ticket.tenantId.toString() !== req.user.tenantId) {
    return next(new AppError("Forbidden: cannot modify another tenant's ticket", 403));
  }

  const previousStatus = ticket.status;
  ticket.status = status;
  if (!ticket.assignedTo) {
    ticket.assignedTo = req.user.id;
  }
  await ticket.save();

  const populated = await ticket.populate([
    { path: 'tenantId', select: 'name slug planTier' },
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTo', select: 'name email role' },
  ]);

  await logAudit({
    tenantId: ticket.tenantId._id || ticket.tenantId,
    actorId: req.user.id,
    actorRole: req.user.role,
    action: 'TICKET_STATUS_UPDATED',
    resourceType: 'Ticket',
    resourceId: ticket._id,
    details: { ticketCode: ticket.ticketCode, from: previousStatus, to: status },
  });

  broadcastEvent('ticket_updated', populated, ticket.tenantId._id || ticket.tenantId);

  res.status(200).json({ success: true, ticket: populated });
});

export default router;