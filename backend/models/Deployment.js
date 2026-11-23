import mongoose from 'mongoose';

const stateHistorySchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deploymentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    serviceName: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
    },
    version: {
      type: String,
      required: [true, 'Version is required'],
      trim: true,
    },
    environment: {
      type: String,
      enum: ['Staging', 'Production'],
      default: 'Staging',
    },
    status: {
      type: String,
      enum: ['Queued', 'Provisioning', 'HealthCheck', 'Live', 'Rollback'],
      default: 'Queued',
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    stateHistory: {
      type: [stateHistorySchema],
      default: [],
    },
  },
  { timestamps: true }
);

// ESR Compound Index: Equality (tenantId, status) -> Sort (createdAt desc)
deploymentSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export const Deployment = mongoose.model('Deployment', deploymentSchema);