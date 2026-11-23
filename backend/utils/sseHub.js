const clients = new Set();

export const addSseClient = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const client = {
    id: `${req.user.id}-${Date.now()}`,
    res,
    role: req.user.role,
    tenantId: req.user.tenantId.toString(),
  };

  clients.add(client);

  // Send immediate handshake event
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Live stream active', role: client.role })}\n\n`);

  // Keep-alive heartbeat every 25s so proxies/browsers don't drop idle connections
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
};

export const broadcastEvent = (eventName, payload, targetTenantId = null) => {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of clients) {
    const isInternalStaff = client.role === 'SuperAdmin' || client.role === 'Engineer';
    const isSameTenant = targetTenantId && client.tenantId === targetTenantId.toString();

    if (isInternalStaff || isSameTenant) {
      client.res.write(data);
    }
  }
};