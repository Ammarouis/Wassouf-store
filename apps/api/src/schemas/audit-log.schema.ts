import { Schema } from 'mongoose';

export const AuditLogSchema = new Schema({
  adminId: { type: Schema.Types.ObjectId, index: true },
  adminUsername: String,
  action: { type: String, required: true, index: true },
  targetType: String,
  targetId: String,
  details: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, strict: false });
