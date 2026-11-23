import { AuditLog } from '../models/AuditLog.js';
import { broadcastEvent } from './sseHub.js';

export const logAudit = async ({
  tenantId,
  actorId,
  actorRole,
  action,
  resourceType,
  resourceId = null,
  details = {},
}) => {
  const entry = await AuditLog.create({
    tenantId,
    actorId,
    actorRole,
    action,
    resourceType,
    resourceId,
    details,
  });

  broadcastEvent('audit_created', entry, tenantId);
  return entry;
};