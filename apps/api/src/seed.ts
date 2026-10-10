import 'dotenv/config';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { normalizeWhatsAppNumber } from '@wassouf/shared';
import { hashPassword } from './auth/admin-auth.service';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function seed() {
  const uri = process.env.MONGODB_URI;
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const secret = process.env.SESSION_SECRET || '';
  if (!uri) throw new Error('Set MONGODB_URI before seeding.');
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error('ADMIN_USERNAME must be 3-40 lowercase Latin letters, digits, dots, dashes, or underscores.');
  if (password.length < 12 || password.length > 128) throw new Error('Set ADMIN_PASSWORD to a strong password between 12 and 128 characters.');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Set SESSION_SECRET to a random value containing at least 32 bytes.');

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  const admins = db.collection('admins');
  const branches = db.collection('branches');
  const settings = db.collection('storesettings');
  const counters = db.collection('counters');

  // Remove the old unique Telegram identifier index. Legacy admin records remain untouched;
  // only username/password accounts created by this seed can sign in to the dashboard.
  const adminIndexes = await admins.listIndexes().toArray().catch(() => [] as any[]);
  for (const index of adminIndexes) {
    if (index.name !== '_id_' && index.key?.telegramUserId && index.unique) {
      await admins.dropIndex(index.name);
    }
  }
  await admins.createIndex({ username: 1 }, { unique: true, sparse: true, name: 'username_1' });

  const owner = await admins.findOne({ username });
  const ownerFields: Record<string, unknown> = {
    username,
    displayName: process.env.ADMIN_DISPLAY_NAME || 'مالك المتجر',
    role: 'owner',
    isActive: true,
    updatedAt: new Date(),
  };
  if (!owner) {
    ownerFields.passwordHash = await hashPassword(password);
    ownerFields.sessionVersion = 0;
    ownerFields.createdAt = new Date();
    await admins.insertOne(ownerFields as any);
  } else {
    // Do not unexpectedly reset an established password on every idempotent seed run.
    if (process.env.ADMIN_RESET_PASSWORD === 'true') {
      ownerFields.passwordHash = await hashPassword(password);
      ownerFields.sessionVersion = Number(owner.sessionVersion || 0) + 1;
    }
    await admins.updateOne({ _id: owner._id }, { $set: ownerFields });
  }

  const branchDefaults = [
    { branchCode: 'BR-01', name: 'فرع الزهراء', address: 'أدخل العنوان الكامل من لوحة التحكم' },
    { branchCode: 'BR-02', name: 'فرع النزهة', address: 'أدخل العنوان الكامل من لوحة التحكم' },
  ];
  for (const branch of branchDefaults) {
    const localNumber = process.env[`${branch.branchCode.replace('-', '_')}_WHATSAPP_LOCAL`] || '';
    const countryCode = process.env[`${branch.branchCode.replace('-', '_')}_WHATSAPP_COUNTRY_CODE`] || '';
    const normalized = normalizeWhatsAppNumber(localNumber, countryCode);
    await branches.updateOne({ branchCode: branch.branchCode }, {
      $setOnInsert: {
        ...branch,
        whatsappLocalNumber: localNumber,
        whatsappCountryCode: countryCode,
        ...(normalized.ok ? { whatsappE164: normalized.e164 } : {}),
        isActive: true,
        isDemo: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }, { upsert: true });
  }

  await settings.updateOne({ key: 'global_settings' }, {
    $setOnInsert: {
      key: 'global_settings',
      storeName: 'الوسوف',
      about: 'متجر الوسوف للهواتف المحمولة. حدّث هذه النبذة من لوحة التحكم قبل الإطلاق.',
      showPrices: false,
      showQuantities: false,
      currency: 'SYP',
      defaultCountryCode: process.env.DEFAULT_WHATSAPP_COUNTRY_CODE || '',
      channelLinks: {},
      whatsappChannelEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }, { upsert: true });

  const existingCodes = await db.collection('products').find({ productCode: /^WSF-\d+$/ }).project({ productCode: 1 }).toArray();
  const maxCode = existingCodes.reduce((maximum, row) => Math.max(maximum, Number(String(row.productCode).slice(4)) || 0), 0);
  await counters.updateOne({ _id: 'product_code' } as any, { $max: { sequence: maxCode } }, { upsert: true });

  console.log(`Dashboard owner ready: ${username}. Existing product, branch, settings and legacy media documents were retained.`);
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
