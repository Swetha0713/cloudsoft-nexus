import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { Tenant } from './models/Tenant.js';
import { User } from './models/User.js';
import { Deployment } from './models/Deployment.js';
import { Ticket } from './models/Ticket.js';
import { AuditLog } from './models/AuditLog.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data for a clean demo reset
    await Promise.all([
      Tenant.deleteMany({}),
      User.deleteMany({}),
      Deployment.deleteMany({}),
      Ticket.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);

    // 1. Create Tenants
    const [cloudsoftHQ, apexFintech, medcoreHealth] = await Tenant.insertMany([
      { name: 'CloudSoft Technologies HQ', slug: 'cloudsoft-hq', planTier: 'MissionCritical' },
      { name: 'Apex FinTech Ltd', slug: 'apex-fintech', planTier: 'Enterprise' },
      { name: 'MedCore Health Systems', slug: 'medcore-health', planTier: 'MissionCritical' },
    ]);

    // 2. Create Users (using User.create so pre('save') password hashing runs)
    const admin = await User.create({
      tenantId: cloudsoftHQ._id,
      name: 'Swetha Dixt',
      email: 'admin@cloudsoft.io',
      passwordHash: 'Password@123',
      role: 'SuperAdmin',
    });

    const engineer = await User.create({
      tenantId: cloudsoftHQ._id,
      name: 'Rohan Verma',
      email: 'engineer@cloudsoft.io',
      passwordHash: 'Password@123',
      role: 'Engineer',
    });

    const apexClient = await User.create({
      tenantId: apexFintech._id,
      name: 'Priya Nair',
      email: 'client@apexfintech.com',
      passwordHash: 'Password@123',
      role: 'ClientViewer',
    });

    const medcoreClient = await User.create({
      tenantId: medcoreHealth._id,
      name: 'Dr. Vikram Mehta',
      email: 'client@medcore.health',
      passwordHash: 'Password@123',
      role: 'ClientViewer',
    });

    // 3. Create Deployments
    const deployments = await Deployment.insertMany([
      {
        tenantId: apexFintech._id,
        serviceName: 'payment-gateway-api',
        version: 'v2.4.1',
        environment: 'Production',
        status: 'HealthCheck',
        triggeredBy: engineer._id,
        stateHistory: [
          { from: 'Queued', to: 'Provisioning', changedBy: engineer._id, note: 'AWS ECS cluster allocated' },
          { from: 'Provisioning', to: 'HealthCheck', changedBy: engineer._id, note: 'Running canary probes' },
        ],
      },
      {
        tenantId: apexFintech._id,
        serviceName: 'ledger-reconciliation-worker',
        version: 'v1.9.0',
        environment: 'Staging',
        status: 'Queued',
        triggeredBy: admin._id,
        stateHistory: [],
      },
      {
        tenantId: medcoreHealth._id,
        serviceName: 'ehr-patient-portal',
        version: 'v4.1.0',
        environment: 'Production',
        status: 'Live',
        triggeredBy: engineer._id,
        stateHistory: [
          { from: 'Queued', to: 'Provisioning', changedBy: engineer._id, note: 'Containers provisioned' },
          { from: 'Provisioning', to: 'HealthCheck', changedBy: engineer._id, note: 'HIPAA endpoints verified' },
          { from: 'HealthCheck', to: 'Live', changedBy: admin._id, note: 'Traffic switched 100%' },
        ],
      },
      {
        tenantId: medcoreHealth._id,
        serviceName: 'dicom-imaging-service',
        version: 'v3.2.5',
        environment: 'Staging',
        status: 'Provisioning',
        triggeredBy: engineer._id,
        stateHistory: [
          { from: 'Queued', to: 'Provisioning', changedBy: engineer._id, note: 'Provisioning GPU nodes' },
        ],
      },
    ]);

    // 4. Create Tickets with realistic SLA deadlines
    const now = Date.now();
    await Ticket.insertMany([
      {
        tenantId: apexFintech._id,
        ticketCode: 'CSN-1001',
        title: 'UPI webhook latency spiking above 4s in Production',
        description: 'Merchant settlement callbacks are timing out intermittently during peak load.',
        priority: 'P1',
        status: 'Open',
        slaDeadline: new Date(now + 2 * 60 * 1000), // 2 mins from now (great for testing SLA escalation!)
        createdBy: apexClient._id,
        assignedTo: engineer._id,
      },
      {
        tenantId: apexFintech._id,
        ticketCode: 'CSN-1002',
        title: 'Staging Redis cache eviction tuning',
        description: 'Need maxmemory-policy switched to allkeys-lru on staging cluster.',
        priority: 'P2',
        status: 'InProgress',
        slaDeadline: new Date(now + 90 * 60 * 1000),
        createdBy: apexClient._id,
        assignedTo: engineer._id,
      },
      {
        tenantId: medcoreHealth._id,
        ticketCode: 'CSN-1003',
        title: 'TLS certificate renewal alert on patient portal',
        description: 'Automated certbot renewal needs validation before expiry next week.',
        priority: 'P2',
        status: 'Open',
        slaDeadline: new Date(now + 120 * 60 * 1000),
        createdBy: medcoreClient._id,
      },
      {
        tenantId: medcoreHealth._id,
        ticketCode: 'CSN-1004',
        title: 'Export monthly HIPAA compliance report',
        description: 'Requesting CSV dump of October access logs.',
        priority: 'P3',
        status: 'Resolved',
        slaDeadline: new Date(now - 60 * 60 * 1000),
        slaBreached: false,
        createdBy: medcoreClient._id,
        assignedTo: admin._id,
      },
    ]);

    // 5. Create Initial Audit Logs
    await AuditLog.insertMany([
      {
        tenantId: apexFintech._id,
        actorId: engineer._id,
        actorRole: 'Engineer',
        action: 'DEPLOYMENT_STAGE_CHANGED',
        resourceType: 'Deployment',
        resourceId: deployments[0]._id,
        details: { from: 'Provisioning', to: 'HealthCheck', service: 'payment-gateway-api' },
      },
      {
        tenantId: medcoreHealth._id,
        actorId: admin._id,
        actorRole: 'SuperAdmin',
        action: 'DEPLOYMENT_STAGE_CHANGED',
        resourceType: 'Deployment',
        resourceId: deployments[2]._id,
        details: { from: 'HealthCheck', to: 'Live', service: 'ehr-patient-portal' },
      },
    ]);

    console.log('[SEED] Database seeded successfully!');
    console.log('--- Demo Login Credentials (Password: Password@123) ---');
    console.log('SuperAdmin : admin@cloudsoft.io');
    console.log('Engineer   : engineer@cloudsoft.io');
    console.log('Apex Client: client@apexfintech.com');
    console.log('MedCore    : client@medcore.health');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[SEED] Error:', error.message);
    process.exit(1);
  }
};

seedDatabase();