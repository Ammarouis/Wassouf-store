import { Schema } from 'mongoose';

export const AnalyticsEventSchema = new Schema({
  type: { type: String, required: true, index: true },
  term: { type: String, default: '' },
  productCode: String,
  branchCode: String,
  createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: false });
