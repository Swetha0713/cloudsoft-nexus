import mongoose from 'mongoose';

const invitationSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
    },
    email: {
      type: String,
      required: [true, 'Invited email is required'],
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ['TenantAdmin', 'Engineer', 'ClientViewer'],
      default: 'Engineer',
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Revoked'],
      default: 'Pending',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// TTL index: Atlas auto-deletes invitation docs once expiresAt is reached
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
invitationSchema.index({ tenantId: 1, email: 1, status: 1 });

export const Invitation = mongoose.model('Invitation', invitationSchema);