import { Ticket } from '../models/Ticket.js';
import { logAudit } from '../utils/auditLogger.js';
import { broadcastEvent } from '../utils/sseHub.js';

export const startSlaWorker = () => {
  const INTERVAL_MS = 30 * 1000; // Check every 30 seconds

  const scanBreaches = async () => {
    try {
      const now = new Date();
      const overdueTickets = await Ticket.find({
        status: { $in: ['Open', 'InProgress'] },
        slaBreached: false,
        slaDeadline: { $lte: now },
      });

      for (const ticket of overdueTickets) {
        ticket.slaBreached = true;
        ticket.status = 'Escalated';
        await ticket.save();

        await logAudit({
          tenantId: ticket.tenantId,
          actorId: ticket.assignedTo || ticket.createdBy,
          actorRole: 'SystemWorker',
          action: 'TICKET_SLA_BREACHED',
          resourceType: 'Ticket',
          resourceId: ticket._id,
          details: {
            ticketCode: ticket.ticketCode,
            priority: ticket.priority,
            slaDeadline: ticket.slaDeadline,
          },
        });

        broadcastEvent(
          'sla_breached',
          {
            ticketId: ticket._id,
            ticketCode: ticket.ticketCode,
            title: ticket.title,
            priority: ticket.priority,
          },
          ticket.tenantId
        );

        console.log(`[SLA-WORKER] Escalated overdue ticket ${ticket.ticketCode} (${ticket.priority})`);
      }
    } catch (error) {
      console.error(`[SLA-WORKER] Scan error: ${error.message}`);
    }
  };

  // Run once shortly after startup, then every 30 seconds
  setTimeout(scanBreaches, 5000);
  setInterval(scanBreaches, INTERVAL_MS);
  console.log('[SLA-WORKER] Automated SLA Escalation Engine started (30s interval)');
};