import { Schema } from 'mongoose';

export const StoreSettingsSchema = new Schema({
  key: { type: String, default: 'global_settings', unique: true },
  storeName: { type: String, default: 'الوسوف للاتصالات' },
  about: { type: String, default: 'متجر الوسوف لأحدث الهواتف المحمولة والإكسسوارات.' },
  showPrices: { type: Boolean, default: true },
  showQuantities: { type: Boolean, default: false },
  currency: { type: String, default: 'SYP' },
  defaultCountryCode: { type: String, default: '' },
  contactPhone: String,
  contactEmail: String,
  contactAddress: String,
  channelLinks: { type: Schema.Types.Mixed, default: {} },
  heroImageUrl: String,
  whatsappChannelUrl: String,
  whatsappChannelEnabled: { type: Boolean, default: false },
  demoStatsEnabled: { type: Boolean, default: false },
  updatedByAdminId: Schema.Types.ObjectId,
}, { timestamps: true, strict: false, minimize: false });
