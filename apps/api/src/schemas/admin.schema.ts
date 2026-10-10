import { Schema } from 'mongoose';
import { ADMIN_ROLES } from '@wassouf/shared';

export const AdminSchema = new Schema({
  username: { type: String, trim: true, lowercase: true, sparse: true },
  displayName: { type: String, trim: true },
  passwordHash: { type: String, select: false },
  role: { type: String, enum: ADMIN_ROLES, default: 'admin' },
  isActive: { type: Boolean, default: true, index: true },
  sessionVersion: { type: Number, default: 0 },
}, { timestamps: true, strict: false });

// Sparse because old admin records are retained during the migration and have no username.
AdminSchema.index({ username: 1 }, { unique: true, sparse: true });
