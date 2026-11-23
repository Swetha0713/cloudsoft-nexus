import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    ticketCode: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Ticket title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    priority: {
      type: String,
      enum: ['P1', 'P2', 'P3'],
      default: 'P2',
    },
    status: {
      type: String,
      enum: ['Open', 'InProgress', 'Escalated', 'Resolved'],
      default: 'Open',
    },
    slaDeadline: {
      type: Date,
      required: true,
    },
    slaBreached: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Dashboard index: tenant's open tickets sorted by most urgent SLA deadline
ticketSchema.index({ tenantId: 1, status: 1, slaDeadline: 1 });

// Background SLA Worker index: finds overdue unbreached tickets across all tenants in O(log N)
ticketSchema.index({ status: 1, slaBreached: 1, slaDeadline: 1 });

export const Ticket = mongoose.model('Ticket', ticketSchema);