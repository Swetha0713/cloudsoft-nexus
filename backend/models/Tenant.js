import mongoose from 'mongoose';

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tenant name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Tenant slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    planTier: {
      type: String,
      enum: ['Standard', 'Enterprise', 'MissionCritical'],
      default: 'Standard',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

export const Tenant = mongoose.model('Tenant', tenantSchema);