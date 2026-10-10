import { Schema } from 'mongoose';
import { PRODUCT_STATUSES } from '@wassouf/shared';

// strict:false intentionally retains fields written by older versions of the store.
// This makes the dashboard migration additive rather than destructive to existing products.
export const ProductSchema = new Schema({
  productCode: { type: String, required: true, unique: true, index: true },
  slug: { type: String, index: true },
  name: { type: String, required: true, index: true },
  brand: { type: String, required: true, index: true },
  model: String,
  description: String,
  specifications: { type: Schema.Types.Mixed, default: {} },
  price: { type: Number, min: 0 },
  currency: { type: String, default: 'SYP' },
  images: { type: [Schema.Types.Mixed], default: [] },
  status: { type: String, enum: PRODUCT_STATUSES, default: 'draft', index: true },
  isFeatured: { type: Boolean, default: false },
  isDemo: { type: Boolean, default: false, index: true },
  searchKeywords: { type: String, default: '' },
  publishedAt: { type: Date },
  createdByAdminId: { type: Schema.Types.ObjectId },
  updatedByAdminId: { type: Schema.Types.ObjectId },
}, { timestamps: true, strict: false, minimize: false });

ProductSchema.index({ name: 'text', brand: 'text', model: 'text', searchKeywords: 'text' });
