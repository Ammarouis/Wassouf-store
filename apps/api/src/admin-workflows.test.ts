import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminController } from './admin.controller';
import { AuthController } from './auth/auth.controller';
import { AdminAuthService, hashPassword } from './auth/admin-auth.service';
import { AdminGuard } from './auth/admin.guard';
import { MediaStorageService, MEDIA_ROOT } from './media/media-storage.service';
import { StoreController } from './store.controller';
import { FakeModel } from './testing/fake-model';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';

const owner = {
  _id: new Types.ObjectId(), username: 'owner', displayName: 'مالك المتجر', role: 'owner' as const,
  isActive: true, sessionVersion: 0, permissions: [],
};

function makeControllers() {
  const branches = new FakeModel([
    { _id: new Types.ObjectId(), branchCode: 'BR-01', name: 'فرع الزهراء', address: 'الزهراء', isActive: true, whatsappLocalNumber: '0984841468', whatsappCountryCode: '963', whatsappE164: '963984841468' },
    { _id: new Types.ObjectId(), branchCode: 'BR-02', name: 'فرع النزهة', address: 'النزهة', isActive: true, whatsappLocalNumber: '', whatsappCountryCode: '', whatsappE164: '' },
  ]);
  const products = new FakeModel();
  const inventory = new FakeModel();
  const admins = new FakeModel();
  const settings = new FakeModel([{ _id: new Types.ObjectId(), key: 'global_settings', storeName: 'الوسوف', showPrices: true, showQuantities: true, currency: 'SYP', defaultCountryCode: '963' }]);
  const events = new FakeModel();
  const audit = new FakeModel();
  const offers = new FakeModel();
  const counters = new FakeModel();
  const media = new MediaStorageService();
  const adminController = new AdminController(products as any, branches as any, inventory as any, admins as any, settings as any, events as any, audit as any, offers as any, counters as any, media);
  const storeController = new StoreController(products as any, branches as any, inventory as any, settings as any, events as any, offers as any);
  return { branches, products, inventory, admins, settings, events, audit, offers, counters, media, adminController, storeController };
}

let originalSecret: string | undefined;
beforeEach(() => {
  originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-bytes-long';
  process.env.NODE_ENV = 'test';
});
afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe('administration workflows against an in-memory model adapter', () => {
  it('creates and edits one catalog product with independent branch stock, then publishes it once', async () => {
    const { adminController, products, inventory, storeController } = makeControllers();
    const created = await adminController.createProduct({
      name: 'iPhone 15 Pro', brand: 'Apple', model: '15 Pro 256GB', currency: 'SYP',
      specifications: { التخزين: '256GB' },
      inventory: [
        { branchCode: 'BR-01', availabilityStatus: 'in_stock', quantity: 4 },
        { branchCode: 'BR-02', availabilityStatus: 'out_of_stock', quantity: 0 },
      ],
    }, owner);
    expect(created.productCode).toBe('WSF-000001');
    expect(created.status).toBe('draft');
    expect(inventory.rows).toHaveLength(2);

    await adminController.updateProduct(created.id, { description: 'هاتف تجريبي', inventory: [
      { branchCode: 'BR-01', availabilityStatus: 'in_stock', quantity: 3 },
      { branchCode: 'BR-02', availabilityStatus: 'ask_to_confirm' },
    ] }, owner);
    await adminController.setProductStatus(created.id, { status: 'published' }, owner);

    const catalog = await storeController.list({ page: '1', pageSize: '10' });
    expect(catalog.total).toBe(1);
    expect(catalog.items).toHaveLength(1);
    expect(catalog.items[0].availability).toHaveLength(2);
    expect(catalog.items[0].availability[0]).toMatchObject({ branchCode: 'BR-01', status: 'in_stock', quantity: 3 });
    expect(catalog.items[0].availability[1]).toMatchObject({ branchCode: 'BR-02', status: 'ask_to_confirm' });
    expect(products.rows[0].description).toBe('هاتف تجريبي');
  });

  it('rejects a duplicate phone identity and validates server-side inventory branches and quantities', async () => {
    const { adminController } = makeControllers();
    await adminController.createProduct({ name: 'Galaxy S25', brand: 'Samsung', model: 'S25 256GB' }, owner);
    await expect(adminController.createProduct({ name: 'Galaxy S25', brand: 'Samsung', model: 'S25 256GB' }, owner)).rejects.toThrow(/مطابق/);
    await expect(adminController.createProduct({ name: 'Galaxy S26', brand: 'Samsung', inventory: [
      { branchCode: 'BR-404', availabilityStatus: 'in_stock', quantity: 2 },
    ] }, owner)).rejects.toThrow(/غير موجود/);
    await expect(adminController.createProduct({ name: 'Galaxy S26', brand: 'Samsung', inventory: [
      { branchCode: 'BR-01', availabilityStatus: 'in_stock', quantity: -2 },
    ] }, owner)).rejects.toThrow(/عددًا صحيحًا/);
  });

  it('stores a real local image file, returns its local URL, and removes it when detached', async () => {
    const { adminController, storeController, media } = makeControllers();
    const created = await adminController.createProduct({ name: 'Pixel 9', brand: 'Google', model: 'Pixel 9 128GB' }, owner);
    await mkdir(MEDIA_ROOT, { recursive: true });
    const filename = `${randomUUID()}.png`;
    const fullPath = path.join(MEDIA_ROOT, filename);
    const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#5897ED' } }).png().toBuffer();
    await writeFile(fullPath, bytes);
    const result = await adminController.uploadProductImages(created.id, [{
      filename, originalname: 'pixel.png', mimetype: 'image/png', size: bytes.length, path: fullPath,
    } as Express.Multer.File], owner);
    expect(result.images[0].url).toBe(`/api/media/${filename}`);
    await adminController.setProductStatus(created.id, { status: 'published' }, owner);
    const publicProduct = await storeController.product(created.productCode);
    expect(publicProduct.images).toHaveLength(1);
    expect(publicProduct.images[0].url).toBe(`/api/media/${filename}`);
    await adminController.removeProductImage(created.id, filename, owner);
    expect(media.getPath(filename)).toBeTruthy();
    await expect(import('node:fs/promises').then(({ stat }) => stat(fullPath))).rejects.toThrow();
  });

  it('creates, updates, stops and deletes branches without losing their contact data', async () => {
    const { adminController, branches } = makeControllers();
    const created = await adminController.createBranch({
      branchCode: 'br-03', name: 'فرع المزة', address: 'شارع رئيسي', whatsappLocalNumber: '0984841468',
      whatsappCountryCode: '963', phone: '0110000000', email: 'branch@example.com',
      channelLinks: { Instagram: 'https://instagram.com/wassouf' }, isActive: true,
    }, owner);
    expect(created.branchCode).toBe('BR-03');
    expect(created.whatsappE164).toBe('963984841468');
    await adminController.updateBranch('BR-03', { name: 'فرع المزة الجديدة', isActive: false }, owner);
    const stored = branches.rows.find((branch) => branch.branchCode === 'BR-03');
    expect(stored).toMatchObject({ name: 'فرع المزة الجديدة', isActive: false, phone: '0110000000' });
    await adminController.deleteBranch('BR-03', owner);
    expect(branches.rows.some((branch) => branch.branchCode === 'BR-03')).toBe(false);
  });

  it('retains inventory records when a branch has stock and refuses its deletion', async () => {
    const { adminController } = makeControllers();
    const product = await adminController.createProduct({ name: 'Xiaomi 14', brand: 'Xiaomi', model: '14 256GB', inventory: [
      { branchCode: 'BR-01', availabilityStatus: 'in_stock', quantity: 1 },
    ] }, owner);
    expect(product.productCode).toBeTruthy();
    await expect(adminController.deleteBranch('BR-01', owner)).rejects.toThrow();
  });

  it('archives a product without deleting its inventory or product data', async () => {
    const { adminController, products, inventory } = makeControllers();
    const product = await adminController.createProduct({ name: 'OnePlus 13', brand: 'OnePlus', model: '13 256GB', inventory: [
      { branchCode: 'BR-01', availabilityStatus: 'in_stock', quantity: 1 },
    ] }, owner);
    const result = await adminController.deleteProduct(product.id, owner);
    expect(result.success).toBe(true);
    expect(result.message).toContain('الاحتفاظ');
    expect(products.rows).toHaveLength(1);
    expect(products.rows[0].status).toBe('archived');
    expect(inventory.rows).toHaveLength(1);
    expect(inventory.rows[0].quantity).toBe(1);
  });

  it('validates store settings and publishes only active offers inside their date window', async () => {
    const { adminController, storeController } = makeControllers();
    const imageUrl = `/api/media/${randomUUID()}.png`;
    await adminController.updateSettings({
      storeName: 'الوسوف المحدث', showPrices: false, showQuantities: true,
      contactEmail: 'info@example.com', heroImageUrl: imageUrl,
      channelLinks: { Instagram: 'https://instagram.com/wassouf' },
      whatsappChannelEnabled: true, whatsappChannelUrl: 'https://whatsapp.com/channel/0123456789',
    }, owner);
    await expect(adminController.updateSettings({ channelLinks: { Instagram: 'javascript:alert(1)' } }, owner)).rejects.toThrow(/https/);
    expect(await storeController.publicSettings()).toMatchObject({
      storeName: 'الوسوف المحدث', showPrices: false, showQuantities: true, heroImageUrl: imageUrl,
      channelLinks: { Instagram: 'https://instagram.com/wassouf' },
    });

    const offer = await adminController.createOffer({
      title: 'عرض الخريف', description: 'خصم خاص', isActive: true,
      startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2030-01-01T00:00:00.000Z',
      ctaLabel: 'اكتشف العرض', ctaUrl: 'https://wassouf.example/offers',
    }, owner);
    expect((await storeController.publicOffers()).map((item: any) => item.id)).toContain(offer.id);
    await expect(adminController.createOffer({ title: 'تاريخ خاطئ', startsAt: '2030-01-01', endsAt: '2029-01-01' }, owner)).rejects.toThrow(/نهاية العرض/);
    await adminController.updateOffer(offer.id, { isActive: false }, owner);
    expect(await storeController.publicOffers()).toHaveLength(0);
    await adminController.deleteOffer(offer.id, owner);
  });
});

describe('admin login, sessions and guards', () => {
  it('hashes passwords and establishes an HttpOnly signed session after valid login', async () => {
    const admins = new FakeModel();
    const passwordHash = await hashPassword('a-very-strong-store-password');
    const admin = await admins.create({ _id: new Types.ObjectId(), username: 'store.owner', displayName: 'Store Owner', role: 'owner', isActive: true, passwordHash, sessionVersion: 0 });
    const auth = new AdminAuthService(admins as any);
    const controller = new AuthController(auth);
    const headers: Record<string, string> = {};
    const request: any = { socket: { remoteAddress: 'test-login' }, header: (key: string) => key === 'x-admin-request' ? '1' : undefined };
    const response: any = { setHeader: (key: string, value: string) => { headers[key] = value; } };
    await controller.login({ username: 'store.owner', password: 'a-very-strong-store-password' }, request, response);
    expect(headers['Set-Cookie']).toContain('HttpOnly');
    expect(headers['Set-Cookie']).toContain('SameSite=Lax');
    const cookieHeader = headers['Set-Cookie'].split(';')[0];
    const authenticated = await auth.authenticateCookie(cookieHeader);
    expect(authenticated.username).toBe('store.owner');

    await controller.logout(request, response);
    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });

  it('rejects a wrong password and mutation requests without the same-site request header', async () => {
    const admins = new FakeModel();
    await admins.create({ _id: new Types.ObjectId(), username: 'store.owner', role: 'owner', isActive: true, passwordHash: await hashPassword('correct-password-123'), sessionVersion: 0 });
    const auth = new AdminAuthService(admins as any);
    const controller = new AuthController(auth);
    const request: any = { socket: { remoteAddress: 'test-wrong-password' }, header: () => '1' };
    const response: any = { setHeader: () => undefined };
    await expect(controller.login({ username: 'store.owner', password: 'incorrect-password' }, request, response)).rejects.toBeInstanceOf(UnauthorizedException);

    const guard = new AdminGuard({ authenticateCookie: async () => owner } as any, { getAllAndOverride: () => 'product:delete' } as any);
    const context: any = { getHandler: () => undefined, getClass: () => undefined, switchToHttp: () => ({ getRequest: () => ({ method: 'POST', header: () => undefined, headers: {} }) }) };
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
