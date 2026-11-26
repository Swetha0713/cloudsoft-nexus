import express from 'express';
import { Tenant } from '../models/Tenant.js';
import { Deployment } from '../models/Deployment.js';
import { Ticket } from '../models/Ticket.js';
import { AuditLog } from '../models/AuditLog.js';
import { protect, authorize, buildTenantFilter } from '../middleware/authMiddleware.js';
import { addSseClient } from '../utils/sseHub.js';

const router = express.Router();

// GET /api/ops/stream (Live Server-Sent Events feed)
router.get('/stream', protect, (req, res) => {
  addSseClient(req, res);
});

// GET /api/ops/tenants (SuperAdmin only — lists all active companies)
router.get('/tenants', protect, authorize('SuperAdmin'), async (req, res) => {
  const tenants = await Tenant.find({ isActive: true }).sort({ name: 1 });
  res.status(200).json({ success: true, tenants });
});

// GET /api/ops/audit-logs (Tenant-isolated immutable compliance logs)
router.get('/audit-logs', protect, async (req, res) => {
  const filter = buildTenantFilter(req);
  const logs = await AuditLog.find(filter)
    .populate('tenantId', 'name slug')
    .populate('actorId', 'name email role')
    .sort({ createdAt: -1 })
    .limit(50);

  res.status(200).json({ success: true, count: logs.length, logs });
});

// GET /api/ops/analytics (Dashboard KPI summary)
router.get('/analytics', protect, async (req, res) => {
  const filter = buildTenantFilter(req);

  const [totalDeployments, liveDeployments, totalTickets, openTickets, breachedTickets] =
    await Promise.all([
      Deployment.countDocuments(filter),
      Deployment.countDocuments({ ...filter, status: 'Live' }),
      Ticket.countDocuments(filter),
      Ticket.countDocuments({ ...filter, status: { $in: ['Open', 'InProgress', 'Escalated'] } }),
      Ticket.countDocuments({ ...filter, slaBreached: true }),
    ]);

  const slaComplianceRate =
    totalTickets === 0 ? 100 : Math.round(((totalTickets - breachedTickets) / totalTickets) * 100);

  res.status(200).json({
    success: true,
    metrics: {
      totalDeployments,
      liveDeployments,
      totalTickets,
      openTickets,
      breachedTickets,
      slaComplianceRate,
    },
  });
});

export default router;