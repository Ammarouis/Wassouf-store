import { afterEach, describe, expect, it } from 'vitest';
import { getModelToken } from '@nestjs/mongoose';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import request from 'supertest';
import sharp from 'sharp';
import { AdminController } from './admin.controller';
import { AuthController } from './auth/auth.controller';
import { AdminAuthService, hashPassword } from './auth/admin-auth.service';
import { AdminGuard } from './auth/admin.guard';
import { MediaController } from './media/media.controller';
import { MediaStorageService } from './media/media-storage.service';
import { StoreController } from './store.controller';
import { FakeModel } from './testing/fake-model';

const originalSecret = process.env.SESSION_SECRET;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

describe('admin HTTP routes with an in-memory database adapter', () => {
  it('logs in, protects routes, creates and publishes a product, uploads an image and serves it locally', async () => {
    process.env.SESSION_SECRET = 'http-test-session-secret-with-at-least-32-bytes';
    process.env.NODE_ENV = 'test';

    const adminId = new Types.ObjectId();
    const admins = new FakeModel([{
      _id: adminId,
      username: 'http.owner',
      displayName: 'مالك المتجر',
      role: 'owner',
      isActive: true,
      sessionVersion: 0,
      passwordHash: await hashPassword('a-strong-integration-password'),
    }]);
    const products = new FakeModel();
    const branches = new FakeModel([{ _id: new Types.ObjectId(), branchCode: 'BR-01', name: 'فرع الاختبار', address: 'العنوان', isActive: true }]);
    const inventory = new FakeModel();
    const settings = new FakeModel();
    const events = new FakeModel();
    const audit = new FakeModel();
    const offers = new FakeModel();
    const counters = new FakeModel();
    const media = new MediaStorageService();
    const auth = new AdminAuthService(admins as any);
    const reflector = new Reflector();
    const moduleBuilder = Test.createTestingModule({
      controllers: [AuthController, AdminController, StoreController, MediaController],
      providers: [
        { provide: AdminAuthService, useValue: auth },
        { provide: AdminGuard, useValue: new AdminGuard(auth, reflector) },
        { provide: Reflector, useValue: reflector },
        { provide: MediaStorageService, useValue: media },
        { provide: getModelToken('Product'), useValue: products },
        { provide: getModelToken('Branch'), useValue: branches },
        { provide: getModelToken('Inventory'), useValue: inventory },
        { provide: getModelToken('Admin'), useValue: admins },
        { provide: getModelToken('StoreSettings'), useValue: settings },
        { provide: getModelToken('AnalyticsEvent'), useValue: events },
        { provide: getModelToken('AuditLog'), useValue: audit },
        { provide: getModelToken('Offer'), useValue: offers },
        { provide: getModelToken('Counter'), useValue: counters },
      ],
    }).overrideGuard(AdminGuard).useValue(new AdminGuard(auth, reflector));
    const testingModule = await moduleBuilder.compile();
    const app = testingModule.createNestApplication();
    await app.init();

    try {
      const http = request(app.getHttpServer());
      const unauthorized = await http.get('/api/admin/products');
      expect(unauthorized.status).toBe(401);

      const login = await http.post('/api/admin/auth/login')
        .set('x-admin-request', '1')
        .send({ username: 'http.owner', password: 'a-strong-integration-password' });
      expect(login.status).toBe(200);
      const cookie = login.headers['set-cookie'][0].split(';')[0];

      const me = await http.get('/api/admin/me').set('Cookie', cookie);
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ username: 'http.owner', role: 'owner' });

      const created = await http.post('/api/admin/products')
        .set('Cookie', cookie)
        .set('x-admin-request', '1')
        .send({ name: 'iPhone HTTP', brand: 'Apple', model: 'HTTP Edition', price: 123456 });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ productCode: 'WSF-000001', status: 'draft' });

      const invalidUpload = await http.post(`/api/admin/products/${created.body.id}/images`)
        .set('Cookie', cookie)
        .set('x-admin-request', '1')
        .attach('images', Buffer.from('not an image'), { filename: 'not-image.pdf', contentType: 'application/pdf' });
      expect(invalidUpload.status).toBe(400);
      expect(invalidUpload.body.message).toContain('JPG');

      const imageBytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#1963E4' } }).png().toBuffer();
      const uploaded = await http.post(`/api/admin/products/${created.body.id}/images`)
        .set('Cookie', cookie)
        .set('x-admin-request', '1')
        .attach('images', imageBytes, { filename: 'phone.png', contentType: 'image/png' });
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.images).toHaveLength(1);
      const imageUrl = uploaded.body.images[0].url;

      const publish = await http.put(`/api/admin/products/${created.body.id}/status`)
        .set('Cookie', cookie)
        .set('x-admin-request', '1')
        .send({ status: 'published' });
      expect(publish.status).toBe(200);

      const publicProduct = await http.get(`/api/products/${created.body.productCode}`);
      expect(publicProduct.status).toBe(200);
      expect(publicProduct.body.images[0].url).toBe(imageUrl);
      expect(publicProduct.body.availability).toHaveLength(1);

      const servedImage = await http.get(imageUrl);
      expect(servedImage.status).toBe(200);
      expect(servedImage.headers['content-type']).toContain('image/png');
      expect(servedImage.body.length).toBeGreaterThan(0);

      const removed = await http.delete(`/api/admin/products/${created.body.id}/images/${uploaded.body.images[0].assetId}`)
        .set('Cookie', cookie)
        .set('x-admin-request', '1');
      expect(removed.status).toBe(200);
      expect((await http.get(imageUrl)).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
