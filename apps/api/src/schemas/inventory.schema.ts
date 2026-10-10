import { Schema } from 'mongoose';
import { AVAILABILITY_STATUSES } from '@wassouf/shared';

export const InventorySchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  branchCode: { type: String, index: true },
  // Older documents also stored a branchId; keep it intact for compatibility.
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
  quantity: { type: Number, min: 0 },
  availabilityStatus: { type: String, enum: AVAILABILITY_STATUSES, default: 'ask_to_confirm' },
  isDemo: { type: Boolean, default: false },
}, { timestamps: true, strict: false });

InventorySchema.index({ productId: 1, branchCode: 1 });
