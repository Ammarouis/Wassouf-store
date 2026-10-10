import { Schema } from 'mongoose';

export const OfferSchema = new Schema({
  title: { type: String, required: true },
  description: String,
  imageUrl: String,
  ctaLabel: String,
  ctaUrl: String,
  isActive: { type: Boolean, default: false, index: true },
  startsAt: Date,
  endsAt: Date,
  createdByAdminId: Schema.Types.ObjectId,
  updatedByAdminId: Schema.Types.ObjectId,
}, { timestamps: true });
