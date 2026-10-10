import { Schema } from 'mongoose';

export const BranchSchema = new Schema({
  branchCode: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  address: { type: String, default: '' },
  whatsappLocalNumber: String,
  whatsappCountryCode: String,
  whatsappE164: String,
  phone: String,
  email: String,
  contactInfo: String,
  channelLinks: { type: Schema.Types.Mixed, default: {} },
  mapsUrl: String,
  imageUrl: String,
  isActive: { type: Boolean, default: true, index: true },
  isDemo: { type: Boolean, default: false, index: true },
}, { timestamps: true, strict: false, minimize: false });
