import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Post,
  Put,
  Query,
  Param,
  Body,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ADMIN_ROLES,
  AVAILABILITY_STATUSES,
  AdminRole,
  AvailabilityStatus,
  formatProductCode,
  normalizeText,
  normalizeWhatsAppNumber,
  PRODUCT_STATUSES,
  ProductStatus,
  ROLE_PERMISSIONS,
  roleHasPermission,
  searchKeywords,
  isValidWhatsAppChannelUrl,
} from '@wassouf/shared';
import { AdminGuard, CurrentAdmin, RequirePermission, assertAdmin, assertAdminPermission } from './auth/admin.guard';
import { AdminRecord, hashPassword, verifyPassword } from './auth/admin-auth.service';
import { createImageUploadOptions, MediaStorageService } from './media/media-storage.service';

const LOCAL_IMAGE = /^\/api\/media\/[a-f\d-]{36}\.(?:jpg|png|webp|gif)$/i;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

@Controller('/api/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    @InjectModel('Product') private readonly products: Model<any>,
    @InjectModel('Branch') private readonly branches: Model<any>,
    @InjectModel('Inventory') private readonly inventory: Model<any>,
    @InjectModel('Admin') private readonly admins: Model<any>,
    @InjectModel('StoreSettings') private readonly settings: Model<any>,
    @InjectModel('AnalyticsEvent') private readonly events: Model<any>,
    @InjectModel('AuditLog') private readonly audit: Model<any>,
    @InjectModel('Offer') private readonly offers: Model<any>,
    @InjectModel('Counter') private readonly counters: Model<any>,
    @Inject(MediaStorageService) private readonly mediaStorage: MediaStorageService,
  ) {}

  @Get('/me')
  me(@CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    return this.publicAdmin(admin);
  }

  @Get('/products')
  @RequirePermission('product:read')
  async listProducts(@Query() query: any) {
    const page = this.pageNumber(query.page, 1);
    const pageSize = Math.min(100, this.pageNumber(query.pageSize, 30));
    const filter: any = {};
    if (typeof query.status === 'string' && query.status) {
      if (!(PRODUCT_STATUSES as string[]).includes(query.status)) throw new BadRequestException('حالة المنتج غير صالحة.');
      filter.status = query.status;
    }
    if (typeof query.branch === 'string' && query.branch) {
      filter._id = { $in: await this.inventory.distinct('productId', { branchCode: query.branch }) };
    }
    if (typeof query.q === 'string' && query.q.trim()) {
      const term = query.q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { productCode: { $regex: term, $options: 'i' } },
        { brand: { $regex: term, $options: 'i' } },
        { model: { $regex: term, $options: 'i' } },
      ];
    }
    const [rows, total, branches] = await Promise.all([
      this.products.find(filter).sort({ updatedAt: -1, createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      this.products.countDocuments(filter),
      this.branches.find().sort({ name: 1 }).lean(),
    ]);
    const inventoryRows = rows.length ? await this.inventory.find({ productId: { $in: rows.map((row: any) => row._id) } }).lean() : [];
    return {
      items: rows.map((row: any) => this.adminProduct(row, inventoryRows, branches)),
      total,
      page,
      pageSize,
    };
  }

  @Get('/products/:id')
  @RequirePermission('product:read')
  async getProduct(@Param('id') id: string) {
    const row = await this.findProduct(id);
    const [inventoryRows, branches] = await Promise.all([
      this.inventory.find({ productId: row._id }).lean(),
      this.branches.find().sort({ name: 1 }).lean(),
    ]);
    return this.adminProduct(row, inventoryRows, branches);
  }

  @Post('/products')
  @RequirePermission('product:create')
  async createProduct(@Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const input = this.productInput(body, true);
    const inventoryRows = await this.validateInventoryRows(body.inventory);
    await this.assertUniqueProduct(input.brand, input.model, input.name);

    const sequence = await this.nextProductSequence();
    const now = new Date();
    const product = await this.products.create({
      productCode: formatProductCode(sequence),
      slug: formatProductCode(sequence).toLowerCase(),
      ...input,
      images: [],
      status: 'draft',
      searchKeywords: searchKeywords(input.name, input.brand, input.model),
      publishedAt: undefined,
      createdByAdminId: admin._id,
      updatedByAdminId: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await this.saveInventoryRows(product._id, inventoryRows);
    } catch (error) {
      await this.products.deleteOne({ _id: product._id });
      throw error;
    }
    await this.log(admin, 'product.create', 'product', String(product._id), { productCode: product.productCode });
    const [savedInventory, branches] = await Promise.all([
      this.inventory.find({ productId: product._id }).lean(),
      this.branches.find().sort({ name: 1 }).lean(),
    ]);
    return this.adminProduct(product.toObject(), savedInventory, branches);
  }

  @Put('/products/:id')
  @RequirePermission('product:edit')
  async updateProduct(@Param('id') id: string, @Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const product = await this.findProduct(id);
    const input = this.productInput(body, false);
    const inventoryRows = body.inventory === undefined ? undefined : await this.validateInventoryRows(body.inventory);
    const nextBrand = input.brand ?? product.brand;
    const nextModel = input.model ?? product.model;
    const nextName = input.name ?? product.name;
    await this.assertUniqueProduct(nextBrand, nextModel, nextName, String(product._id));

    for (const [key, value] of Object.entries(input)) product.set(key, value);
    if (input.name !== undefined || input.brand !== undefined || input.model !== undefined) {
      product.searchKeywords = searchKeywords(product.name, product.brand, product.model);
      product.slug = String(product.productCode).toLowerCase();
    }
    product.updatedByAdminId = admin._id;
    await product.save();
    if (inventoryRows) await this.saveInventoryRows(product._id, inventoryRows);
    await this.log(admin, 'product.update', 'product', String(product._id), { productCode: product.productCode });
    const [savedInventory, branches] = await Promise.all([
      this.inventory.find({ productId: product._id }).lean(),
      this.branches.find().sort({ name: 1 }).lean(),
    ]);
    return this.adminProduct(product.toObject(), savedInventory, branches);
  }

  @Put('/products/:id/status')
  async setProductStatus(@Param('id') id: string, @Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const status = body?.status as ProductStatus;
    if (!(PRODUCT_STATUSES as string[]).includes(status)) throw new BadRequestException('حالة المنتج غير صالحة.');
    const permission = status === 'archived' ? 'product:archive' : 'product:visibility';
    assertAdminPermission(admin, permission);
    const product = await this.findProduct(id);
    if (status === 'published') await this.assertUniqueProduct(product.brand, product.model, product.name, String(product._id));
    product.status = status;
    if (status === 'published' && !product.publishedAt) product.publishedAt = new Date();
    product.updatedByAdminId = admin._id;
    await product.save();
    await this.log(admin, 'product.status', 'product', String(product._id), { productCode: product.productCode, status });
    const [inventoryRows, branches] = await Promise.all([
      this.inventory.find({ productId: product._id }).lean(),
      this.branches.find().sort({ name: 1 }).lean(),
    ]);
    return this.adminProduct(product.toObject(), inventoryRows, branches);
  }

  @Delete('/products/:id')
  @RequirePermission('product:delete')
  async deleteProduct(@Param('id') id: string, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const product = await this.findProduct(id);
    product.status = 'archived';
    product.updatedByAdminId = admin._id;
    await product.save();
    await this.log(admin, 'product.archive', 'product', String(product._id), { productCode: product.productCode });
    return { success: true, message: 'تمت أرشفة الهاتف مع الاحتفاظ ببياناته وصوره وسجل مخزونه.' };
  }

  @Post('/products/:id/images')
  @RequirePermission('product:edit')
  @UseInterceptors(FilesInterceptor('images', 8, createImageUploadOptions(8)))
  async uploadProductImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentAdmin() admin: AdminRecord,
  ) {
    assertAdmin(admin);
    const product = await this.products.findById(id).exec();
    if (!product) {
      await this.removeUploadedFiles(files);
      throw new NotFoundException('المنتج غير موجود.');
    }
    if (!files?.length) throw new BadRequestException('اختر صورة واحدة على الأقل بصيغة JPG أو PNG أو WebP أو GIF.');
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      await this.removeUploadedFiles(files);
      throw new BadRequestException('حجم الصورة الواحدة يجب ألا يتجاوز 8 ميغابايت.');
    }
    try {
      for (const file of files) await this.mediaStorage.validateUpload(file);
      const current = Array.isArray(product.images) ? [...product.images] : [];
      const uploaded = files.map((file, index) => ({
        assetId: file.filename,
        url: `/api/media/${file.filename}`,
        originalName: file.originalname.slice(0, 160),
        mimeType: file.mimetype,
        size: file.size,
        sortOrder: current.length + index,
        alt: String(product.name || '').slice(0, 160),
      }));
      product.images = [...current, ...uploaded];
      product.updatedByAdminId = admin._id;
      await product.save();
      await this.log(admin, 'product.images.upload', 'product', String(product._id), { count: uploaded.length });
      return { success: true, images: uploaded };
    } catch (error) {
      await this.removeUploadedFiles(files);
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(error instanceof Error ? error.message : 'تعذر حفظ الصور.');
    }
  }

  @Delete('/products/:id/images/:filename')
  @RequirePermission('product:edit')
  async removeProductImage(@Param('id') id: string, @Param('filename') filename: string, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const product = await this.findProduct(id);
    const path = `/api/media/${filename}`;
    const images = Array.isArray(product.images) ? product.images : [];
    const filtered = images.filter((image: any) => !(image?.url === path || image?.assetId === filename));
    if (filtered.length === images.length) throw new NotFoundException('الصورة غير مرتبطة بهذا المنتج.');
    product.images = filtered;
    product.updatedByAdminId = admin._id;
    await product.save();
    if (!(await this.isMediaReferenced(filename))) await this.mediaStorage.remove(filename);
    await this.log(admin, 'product.image.remove', 'product', String(product._id), { filename });
    return { success: true };
  }

  @Put('/products/:id/inventory')
  @RequirePermission('inventory:edit')
  async upsertInventory(@Param('id') id: string, @Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const product = await this.findProduct(id);
    const rows = await this.validateInventoryRows([body]);
    await this.saveInventoryRows(product._id, rows);
    await this.log(admin, 'inventory.update', 'product', String(product._id), { productCode: product.productCode, branchCode: rows[0].branchCode });
    return this.inventory.findOne({ productId: product._id, branchCode: rows[0].branchCode }).lean();
  }

  @Get('/branches')
  @RequirePermission('branch:read')
  async listBranches() {
    const rows = await this.branches.find().sort({ name: 1 }).lean();
    return rows.map((row: any) => this.adminBranch(row));
  }

  @Post('/branches')
  @RequirePermission('branch:edit')
  async createBranch(@Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const branchCode = this.branchCode(body?.branchCode);
    if (await this.branches.exists({ branchCode })) throw new ConflictException('رمز الفرع مستخدم مسبقًا.');
    const input = await this.branchInput(body, true);
    const branch = await this.branches.create({ branchCode, ...input, isActive: input.isActive ?? true, isDemo: false });
    await this.log(admin, 'branch.create', 'branch', branchCode, { name: branch.name });
    return this.adminBranch(branch.toObject());
  }

  @Put('/branches/:code')
  @RequirePermission('branch:edit')
  async updateBranch(@Param('code') rawCode: string, @Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const branchCode = this.branchCode(rawCode);
    const branch = await this.branches.findOne({ branchCode }).exec();
    if (!branch) throw new NotFoundException('الفرع غير موجود.');
    const input = await this.branchInput(body, false, branch);
    for (const [key, value] of Object.entries(input)) branch.set(key, value);
    await branch.save();
    await this.log(admin, 'branch.update', 'branch', branchCode, { name: branch.name, isActive: branch.isActive });
    return this.adminBranch(branch.toObject());
  }

  @Delete('/branches/:code')
  @RequirePermission('branch:edit')
  async deleteBranch(@Param('code') rawCode: string, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const branchCode = this.branchCode(rawCode);
    const branch: any = await this.branches.findOne({ branchCode }).lean();
    if (!branch) throw new NotFoundException('الفرع غير موجود.');
    const stockCount = await this.inventory.countDocuments({ $or: [{ branchCode }, ...(branch._id ? [{ branchId: branch._id }] : [])] });
    if (stockCount > 0) throw new ConflictException('يوجد سجل توفر مرتبط بهذا الفرع. أوقف الفرع بدل حذفه للحفاظ على سجل المخزون.');
    await this.branches.deleteOne({ _id: branch._id });
    await this.log(admin, 'branch.delete', 'branch', branchCode, { name: branch.name });
    return { success: true };
  }

  @Get('/settings')
  @RequirePermission('settings:edit')
  async getSettings() {
    const settings = await this.settings.findOne({ key: 'global_settings' }).lean();
    return this.adminSettings(settings || {});
  }

  @Put('/settings')
  @RequirePermission('settings:edit')
  async updateSettings(@Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const input: Record<string, any> = {};
    for (const key of ['storeName', 'about', 'showPrices', 'showQuantities', 'currency', 'defaultCountryCode', 'contactPhone', 'contactEmail', 'contactAddress', 'heroImageUrl', 'whatsappChannelUrl', 'whatsappChannelEnabled', 'channelLinks']) {
      if (body?.[key] !== undefined) input[key] = body[key];
    }
    if ('storeName' in input) input.storeName = this.requiredString(input.storeName, 'اسم المتجر', 100);
    if ('about' in input) input.about = this.optionalString(input.about, 'نبذة المتجر', 3000);
    if ('currency' in input) {
      input.currency = this.requiredString(input.currency, 'العملة', 8).toUpperCase();
      if (!/^[A-Z\u0600-\u06ff]{2,8}$/.test(input.currency)) throw new BadRequestException('رمز العملة غير صالح.');
    }
    if ('defaultCountryCode' in input) {
      input.defaultCountryCode = String(input.defaultCountryCode || '').replace(/\D/g, '');
      if (input.defaultCountryCode && !/^[1-9]\d{0,2}$/.test(input.defaultCountryCode)) throw new BadRequestException('رمز الدولة غير صالح.');
    }
    for (const key of ['showPrices', 'showQuantities', 'whatsappChannelEnabled']) if (key in input) input[key] = this.boolean(input[key], key);
    for (const key of ['contactPhone', 'contactAddress']) if (key in input) input[key] = this.optionalString(input[key], key, key === 'contactAddress' ? 300 : 50);
    if ('contactEmail' in input) input.contactEmail = this.email(input.contactEmail, 'البريد الإلكتروني', true);
    if ('heroImageUrl' in input) input.heroImageUrl = this.localImageOrEmpty(input.heroImageUrl, 'صورة الواجهة');
    if ('whatsappChannelUrl' in input) {
      input.whatsappChannelUrl = this.optionalString(input.whatsappChannelUrl, 'رابط قناة واتساب', 500);
      if (input.whatsappChannelUrl && !isValidWhatsAppChannelUrl(input.whatsappChannelUrl)) throw new BadRequestException('رابط قناة واتساب غير صالح.');
    }
    if ('channelLinks' in input) input.channelLinks = this.links(input.channelLinks);

    const row = await this.settings.findOneAndUpdate(
      { key: 'global_settings' },
      { $set: { ...input, updatedByAdminId: admin._id }, $setOnInsert: { key: 'global_settings' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    await this.log(admin, 'settings.update', 'settings', 'global_settings', { fields: Object.keys(input) });
    return this.adminSettings(row || {});
  }

  @Get('/offers')
  @RequirePermission('offers:edit')
  async listOffers() {
    const rows = await this.offers.find().sort({ createdAt: -1 }).lean();
    return rows.map((row: any) => this.adminOffer(row));
  }

  @Post('/offers')
  @RequirePermission('offers:edit')
  async createOffer(@Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const input = this.offerInput(body, true);
    const row = await this.offers.create({ ...input, createdByAdminId: admin._id, updatedByAdminId: admin._id });
    await this.log(admin, 'offer.create', 'offer', String(row._id), { title: row.title });
    return this.adminOffer(row.toObject());
  }

  @Put('/offers/:id')
  @RequirePermission('offers:edit')
  async updateOffer(@Param('id') id: string, @Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const row = await this.findById(this.offers, id, 'العرض');
    const input = this.offerInput(body, false);
    for (const [key, value] of Object.entries(input)) row.set(key, value);
    row.updatedByAdminId = admin._id;
    await row.save();
    await this.log(admin, 'offer.update', 'offer', String(row._id), { title: row.title });
    return this.adminOffer(row.toObject());
  }

  @Delete('/offers/:id')
  @RequirePermission('offers:edit')
  async deleteOffer(@Param('id') id: string, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const row = await this.findById(this.offers, id, 'العرض');
    const filename = this.filenameFromUrl(row.imageUrl);
    await this.offers.deleteOne({ _id: row._id });
    if (filename && !(await this.isMediaReferenced(filename))) await this.mediaStorage.remove(filename);
    await this.log(admin, 'offer.delete', 'offer', String(row._id), { title: row.title });
    return { success: true };
  }

  @Post('/uploads')
  @RequirePermission('settings:edit')
  @UseInterceptors(FileInterceptor('image', createImageUploadOptions(1)))
  async uploadStoreImage(@UploadedFile() file: Express.Multer.File | undefined, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    if (!file) throw new BadRequestException('اختر صورة واحدة بصيغة JPG أو PNG أو WebP أو GIF.');
    if (file.size > MAX_IMAGE_BYTES) {
      await this.mediaStorage.remove(file.filename);
      throw new BadRequestException('حجم الصورة يجب ألا يتجاوز 8 ميغابايت.');
    }
    try {
      await this.mediaStorage.validateUpload(file);
    } catch (error) {
      await this.mediaStorage.remove(file.filename);
      throw new BadRequestException(error instanceof Error ? error.message : 'تعذر التحقق من الصورة.');
    }
    await this.log(admin, 'media.upload', 'media', file.filename, { size: file.size, mimeType: file.mimetype });
    return { id: file.filename, url: `/api/media/${file.filename}`, size: file.size, mimeType: file.mimetype };
  }

  @Delete('/uploads/:filename')
  @RequirePermission('settings:edit')
  async deleteUnusedUpload(@Param('filename') filename: string, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    if (!this.mediaStorage.getPath(filename)) throw new BadRequestException('اسم الملف غير صالح.');
    if (await this.isMediaReferenced(filename)) throw new ConflictException('لا يمكن حذف صورة مستخدمة في المتجر.');
    await this.mediaStorage.remove(filename);
    await this.log(admin, 'media.delete', 'media', filename);
    return { success: true };
  }

  @Get('/stats')
  @RequirePermission('stats:view')
  async stats() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const [publishedProducts, brands, searchesToday, whatsappClicksToday, topSearches, branches, activeOffers, admins] = await Promise.all([
      this.products.countDocuments({ status: 'published', isDemo: { $ne: true } }),
      this.products.distinct('brand', { status: 'published', isDemo: { $ne: true } }),
      this.events.countDocuments({ type: 'search', createdAt: { $gte: today } }),
      this.events.countDocuments({ type: 'whatsapp_click', createdAt: { $gte: today } }),
      this.events.aggregate([
        { $match: { type: 'search', createdAt: { $gte: today }, term: { $ne: '' } } },
        { $group: { _id: '$term', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      this.branches.countDocuments({ isActive: true }),
      this.offers.countDocuments({ isActive: true }),
      this.admins.countDocuments({ username: { $exists: true }, isActive: true }),
    ]);
    return {
      publishedProducts,
      brands: brands.length,
      searchesToday,
      whatsappClicksToday,
      topSearches: topSearches.map((row: any) => ({ term: row._id, count: row.count })),
      activeBranches: branches,
      activeOffers,
      activeAdmins: admins,
      isDemo: false,
    };
  }

  @Get('/audit-logs')
  @RequirePermission('stats:view')
  async auditLogs(@Query() query: any) {
    const page = this.pageNumber(query.page, 1);
    const pageSize = Math.min(100, this.pageNumber(query.pageSize, 30));
    const filter: any = {};
    if (typeof query.action === 'string' && query.action.trim()) filter.action = query.action.trim().slice(0, 100);
    const [rows, total] = await Promise.all([
      this.audit.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      this.audit.countDocuments(filter),
    ]);
    return {
      items: rows.map((row: any) => ({
        id: String(row._id),
        action: row.action || 'activity',
        adminUsername: row.adminUsername || 'إدارة المتجر',
        targetType: row.targetType || '',
        targetId: row.targetId || '',
        details: this.cleanLegacyDetails(row.details || row.after || {}),
        createdAt: row.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  @Get('/admins')
  @RequirePermission('admins:manage')
  async listAdmins() {
    const rows = await this.admins.find({ username: { $exists: true } }).sort({ createdAt: 1 }).lean();
    return rows.map((row: any) => this.publicAdmin(row));
  }

  @Post('/admins')
  @RequirePermission('admins:manage')
  async createAdmin(@Body() body: any, @CurrentAdmin() actor: AdminRecord) {
    assertAdmin(actor);
    const username = this.username(body?.username);
    if (await this.admins.exists({ username })) throw new ConflictException('اسم المستخدم مستخدم مسبقًا.');
    const password = this.password(body?.password);
    const role = this.role(body?.role);
    const displayName = this.requiredString(body?.displayName, 'الاسم الظاهر', 80);
    const row = await this.admins.create({ username, passwordHash: await hashPassword(password), role, displayName, isActive: true, sessionVersion: 0 });
    await this.log(actor, 'admin.create', 'admin', String(row._id), { username, role });
    return this.publicAdmin(row.toObject());
  }

  @Put('/admins/:id')
  @RequirePermission('admins:manage')
  async updateAdmin(@Param('id') id: string, @Body() body: any, @CurrentAdmin() actor: AdminRecord) {
    assertAdmin(actor);
    const row = await this.findById(this.admins, id, 'حساب الإدارة');
    if (!row.username) throw new NotFoundException('حساب الإدارة غير موجود.');
    const changes: Record<string, any> = {};
    if (body.displayName !== undefined) changes.displayName = this.requiredString(body.displayName, 'الاسم الظاهر', 80);
    if (body.role !== undefined) changes.role = this.role(body.role);
    if (body.isActive !== undefined) changes.isActive = this.boolean(body.isActive, 'حالة الحساب');
    if (body.password !== undefined && body.password !== '') changes.passwordHash = await hashPassword(this.password(body.password));
    if (String(row._id) === String(actor._id) && changes.isActive === false) throw new BadRequestException('لا يمكنك تعطيل حسابك الحالي.');
    if (row.role === 'owner' && (changes.role && changes.role !== 'owner' || changes.isActive === false)) {
      await this.ensureAnotherOwner(String(row._id));
    }
    if (changes.passwordHash || changes.role !== undefined || changes.isActive !== undefined) {
      changes.sessionVersion = Number(row.sessionVersion || 0) + 1;
    }
    for (const [key, value] of Object.entries(changes)) row.set(key, value);
    await row.save();
    await this.log(actor, 'admin.update', 'admin', String(row._id), { fields: Object.keys(changes).filter((key) => key !== 'passwordHash' && key !== 'sessionVersion') });
    return this.publicAdmin(row.toObject());
  }

  @Delete('/admins/:id')
  @RequirePermission('admins:manage')
  async deactivateAdmin(@Param('id') id: string, @CurrentAdmin() actor: AdminRecord) {
    assertAdmin(actor);
    const row = await this.findById(this.admins, id, 'حساب الإدارة');
    if (!row.username) throw new NotFoundException('حساب الإدارة غير موجود.');
    if (String(row._id) === String(actor._id)) throw new BadRequestException('لا يمكنك تعطيل حسابك الحالي.');
    if (row.role === 'owner') await this.ensureAnotherOwner(String(row._id));
    row.isActive = false;
    row.sessionVersion = Number(row.sessionVersion || 0) + 1;
    await row.save();
    await this.log(actor, 'admin.deactivate', 'admin', String(row._id), { username: row.username });
    return { success: true };
  }

  @Put('/account/password')
  async changeOwnPassword(@Body() body: any, @CurrentAdmin() admin: AdminRecord) {
    assertAdmin(admin);
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = this.password(body?.newPassword);
    const row = await this.admins.findById(admin._id).select('+passwordHash').exec();
    if (!row || !await verifyPassword(currentPassword, row.passwordHash)) throw new ForbiddenException('كلمة المرور الحالية غير صحيحة.');
    row.passwordHash = await hashPassword(newPassword);
    row.sessionVersion = Number(row.sessionVersion || 0) + 1;
    await row.save();
    await this.log(admin, 'admin.password.change', 'admin', String(row._id));
    return { success: true, message: 'تم تغيير كلمة المرور. سجّل الدخول مجددًا.' };
  }

  private async nextProductSequence(): Promise<number> {
    const rows = await this.products.find({ productCode: /^WSF-\d+$/ }).select('productCode').lean();
    const maxExisting = rows.reduce((max: number, row: any) => Math.max(max, Number(String(row.productCode).slice(4)) || 0), 0);
    await this.counters.updateOne({ _id: 'product_code' }, { $max: { sequence: maxExisting } }, { upsert: true });
    const counter: any = await this.counters.findOneAndUpdate({ _id: 'product_code' }, { $inc: { sequence: 1 } }, { upsert: true, new: true });
    if (!counter || !Number.isSafeInteger(counter.sequence)) throw new Error('تعذر إنشاء رقم منتج فريد.');
    return counter.sequence;
  }

  private productInput(body: any, creating: boolean): Record<string, any> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('بيانات المنتج غير صالحة.');
    const result: Record<string, any> = {};
    for (const field of ['name', 'brand', 'model', 'description', 'currency']) {
      if (body[field] === undefined && !creating) continue;
      if (field === 'name' || field === 'brand') result[field] = this.requiredString(body[field], field === 'name' ? 'اسم الهاتف' : 'الماركة', 120);
      else if (field === 'model') result[field] = this.optionalString(body[field], 'الموديل', 160);
      else if (field === 'description') result[field] = this.optionalString(body[field], 'الوصف', 4000);
      else if (field === 'currency') result[field] = body[field] === undefined ? 'SYP' : this.requiredString(body[field], 'العملة', 8).toUpperCase();
    }
    if (body.price !== undefined) {
      if (body.price === null || body.price === '') result.price = undefined;
      else {
        const price = Number(body.price);
        if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new BadRequestException('السعر يجب أن يكون رقمًا موجبًا أو فارغًا.');
        result.price = price;
      }
    } else if (creating) result.price = undefined;
    if (body.specifications !== undefined || creating) result.specifications = this.specifications(body.specifications);
    if (body.isFeatured !== undefined) result.isFeatured = this.boolean(body.isFeatured, 'تمييز المنتج');
    else if (creating) result.isFeatured = false;
    return result;
  }

  private specifications(value: unknown): Record<string, string> {
    if (value === undefined || value === null || value === '') return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('المواصفات يجب أن تكون قائمة من أسماء وقيم.');
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 40) throw new BadRequestException('الحد الأقصى للمواصفات هو 40 عنصرًا.');
    const result: Record<string, string> = {};
    for (const [key, value] of entries) {
      const cleanKey = key.trim();
      if (!cleanKey || ['__proto__', 'prototype', 'constructor'].includes(cleanKey.toLowerCase()) || cleanKey.length > 60 || typeof value !== 'string' || value.trim().length > 300) {
        throw new BadRequestException('تحقق من أسماء وقيم المواصفات؛ الحد الأقصى 60 حرفًا للاسم و300 للقيمة.');
      }
      result[cleanKey] = value.trim();
    }
    return result;
  }

  private async validateInventoryRows(value: unknown): Promise<Array<{ branchCode: string; quantity?: number; availabilityStatus: AvailabilityStatus; branchId: Types.ObjectId }>> {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100) throw new BadRequestException('قائمة توفر الفروع غير صالحة.');
    const rows: Array<{ branchCode: string; quantity?: number; availabilityStatus: AvailabilityStatus; branchId: Types.ObjectId }> = [];
    const seen = new Set<string>();
    for (const row of value) {
      const branchCode = this.branchCode(row?.branchCode);
      if (seen.has(branchCode)) throw new BadRequestException('لا يمكن تكرار الفرع نفسه ضمن مخزون الهاتف.');
      seen.add(branchCode);
      const branch: any = await this.branches.findOne({ branchCode }).select('_id branchCode').lean();
      if (!branch) throw new BadRequestException(`الفرع ${branchCode} غير موجود.`);
      const status = row?.availabilityStatus;
      if (!(AVAILABILITY_STATUSES as string[]).includes(status)) throw new BadRequestException(`حالة التوفر للفرع ${branchCode} غير صالحة.`);
      let quantity: number | undefined;
      if (row.quantity !== undefined && row.quantity !== null && row.quantity !== '') {
        quantity = Number(row.quantity);
        if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 1_000_000) throw new BadRequestException(`الكمية للفرع ${branchCode} يجب أن تكون عددًا صحيحًا من 0 إلى 1,000,000.`);
      }
      rows.push({ branchCode, availabilityStatus: status, ...(quantity !== undefined ? { quantity } : {}), branchId: branch._id });
    }
    return rows;
  }

  private async saveInventoryRows(productId: Types.ObjectId, rows: Array<{ branchCode: string; quantity?: number; availabilityStatus: AvailabilityStatus; branchId: Types.ObjectId }>) {
    for (const row of rows) {
      const existing = await this.inventory.findOne({ productId, branchCode: row.branchCode }).exec()
        || await this.inventory.findOne({ productId, branchId: row.branchId }).exec();
      const update: any = {
        $set: { productId, branchCode: row.branchCode, branchId: row.branchId, availabilityStatus: row.availabilityStatus, updatedAt: new Date() },
      };
      if (row.quantity === undefined) update.$unset = { quantity: 1 };
      else update.$set.quantity = row.quantity;
      if (existing) await this.inventory.updateOne({ _id: existing._id }, update);
      else await this.inventory.updateOne({ productId, branchCode: row.branchCode }, update, { upsert: true, setDefaultsOnInsert: true });
    }
  }

  private async assertUniqueProduct(brand: string, model: string | undefined, name: string, ignoredId?: string) {
    const rows = await this.products.find({ status: { $ne: 'archived' }, isDemo: { $ne: true } }).select('_id name brand model').lean();
    const wantedBrand = normalizeText(brand);
    const wantedIdentity = normalizeText(model || name);
    const duplicate = rows.find((row: any) => String(row._id) !== ignoredId
      && normalizeText(String(row.brand || '')) === wantedBrand
      && normalizeText(String(row.model || row.name || '')) === wantedIdentity);
    if (duplicate) throw new ConflictException('يوجد هاتف مطابق بالماركة والموديل في الكتالوج. عدّل الهاتف الموجود بدل إنشاء نسخة مكررة.');
  }

  private async branchInput(body: any, creating: boolean, current?: any): Promise<Record<string, any>> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('بيانات الفرع غير صالحة.');
    const result: Record<string, any> = {};
    const allowed = ['name', 'address', 'whatsappLocalNumber', 'whatsappCountryCode', 'phone', 'email', 'contactInfo', 'channelLinks', 'mapsUrl', 'imageUrl', 'isActive'];
    for (const field of allowed) if (body[field] !== undefined) result[field] = body[field];
    if (creating || 'name' in result) result.name = this.requiredString(result.name, 'اسم الفرع', 100);
    if ('address' in result || creating) result.address = this.optionalString(result.address, 'العنوان', 300);
    if ('whatsappLocalNumber' in result) result.whatsappLocalNumber = this.optionalString(result.whatsappLocalNumber, 'رقم واتساب', 40);
    if ('whatsappCountryCode' in result) {
      result.whatsappCountryCode = String(result.whatsappCountryCode || '').replace(/\D/g, '');
      if (result.whatsappCountryCode && !/^[1-9]\d{0,2}$/.test(result.whatsappCountryCode)) throw new BadRequestException('رمز الدولة للفرع غير صالح.');
    }
    if ('whatsappLocalNumber' in result || 'whatsappCountryCode' in result) {
      const number = result.whatsappLocalNumber ?? current?.whatsappLocalNumber ?? (current?.whatsappE164 ? `+${current.whatsappE164}` : '');
      if (number) {
        const settings: any = await this.settings.findOne({ key: 'global_settings' }).select('defaultCountryCode').lean();
        const countryCode = result.whatsappCountryCode || current?.whatsappCountryCode || settings?.defaultCountryCode || '';
        const normalized = normalizeWhatsAppNumber(number, countryCode);
        if (!normalized.ok) throw new BadRequestException(normalized.error || 'رقم واتساب غير صالح.');
        result.whatsappE164 = normalized.e164;
        if (!('whatsappLocalNumber' in result)) result.whatsappLocalNumber = current?.whatsappLocalNumber || number;
      } else result.whatsappE164 = '';
    }
    if ('phone' in result) result.phone = this.optionalString(result.phone, 'رقم التواصل', 50);
    if ('email' in result) result.email = this.email(result.email, 'البريد الإلكتروني', true);
    if ('contactInfo' in result) result.contactInfo = this.optionalString(result.contactInfo, 'معلومات التواصل', 300);
    if ('mapsUrl' in result) result.mapsUrl = this.webUrl(result.mapsUrl, 'رابط الخريطة', true);
    if ('imageUrl' in result) result.imageUrl = this.localImageOrEmpty(result.imageUrl, 'صورة الفرع');
    if ('channelLinks' in result) result.channelLinks = this.links(result.channelLinks);
    if ('isActive' in result) result.isActive = this.boolean(result.isActive, 'حالة الفرع');
    else if (creating) result.isActive = true;
    return result;
  }

  private branchCode(value: unknown): string {
    const code = this.requiredString(value, 'رمز الفرع', 20).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)) throw new BadRequestException('رمز الفرع يجب أن يتكون من أحرف لاتينية وأرقام وشرطة فقط.');
    return code;
  }

  private async findProduct(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('المنتج غير موجود.');
    const product = await this.products.findById(id).exec();
    if (!product) throw new NotFoundException('المنتج غير موجود.');
    return product;
  }

  private async findById(model: Model<any>, id: string, label: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(`${label} غير موجود.`);
    const row = await model.findById(id).exec();
    if (!row) throw new NotFoundException(`${label} غير موجود.`);
    return row;
  }

  private adminProduct(row: any, inventoryRows: any[], branches: any[]) {
    const images = Array.isArray(row.images) ? row.images : [];
    const visibleImages = images.flatMap((image: any, index: number) => {
      const url = typeof image === 'string' ? image : image?.url;
      if (!this.localImage(url)) return [];
      return [{
        assetId: this.filenameFromUrl(url),
        url,
        alt: typeof image?.alt === 'string' ? image.alt : '',
        originalName: typeof image?.originalName === 'string' ? image.originalName : '',
        size: Number.isFinite(image?.size) ? image.size : undefined,
        sortOrder: Number.isFinite(image?.sortOrder) ? image.sortOrder : index,
      }];
    });
    const inventory = inventoryRows
      .filter((entry: any) => String(entry.productId) === String(row._id))
      .map((entry: any) => {
        const branch = branches.find((candidate: any) => candidate.branchCode === entry.branchCode || String(candidate._id) === String(entry.branchId));
        if (!branch) return null;
        const status = (AVAILABILITY_STATUSES as string[]).includes(entry.availabilityStatus) ? entry.availabilityStatus : 'ask_to_confirm';
        return {
          branchCode: branch.branchCode,
          branchName: branch.name,
          quantity: Number.isFinite(entry.quantity) ? entry.quantity : null,
          availabilityStatus: status,
        };
      }).filter(Boolean);
    return {
      id: String(row._id),
      productCode: row.productCode,
      name: row.name || '',
      brand: row.brand || '',
      model: row.model || '',
      description: row.description || '',
      specifications: row.specifications instanceof Map ? Object.fromEntries(row.specifications) : row.specifications || {},
      ...(Number.isFinite(row.price) ? { price: row.price } : {}),
      currency: row.currency || 'SYP',
      status: (PRODUCT_STATUSES as string[]).includes(row.status) ? row.status : 'draft',
      isFeatured: Boolean(row.isFeatured),
      isDemo: Boolean(row.isDemo),
      images: visibleImages,
      legacyImagesCount: Math.max(0, images.length - visibleImages.length),
      inventory,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
    };
  }

  private adminBranch(row: any) {
    return {
      id: String(row._id),
      branchCode: row.branchCode,
      name: row.name || '',
      address: row.address || '',
      whatsappLocalNumber: row.whatsappLocalNumber || '',
      whatsappCountryCode: row.whatsappCountryCode || '',
      whatsappE164: row.whatsappE164 || '',
      phone: row.phone || '',
      email: row.email || '',
      contactInfo: row.contactInfo || '',
      channelLinks: this.links(row.channelLinks || {}),
      mapsUrl: row.mapsUrl || '',
      imageUrl: this.localImage(row.imageUrl) ? row.imageUrl : '',
      isActive: row.isActive !== false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private adminSettings(row: any) {
    return {
      storeName: row.storeName || 'الوسوف للاتصالات',
      about: row.about || '',
      showPrices: row.showPrices !== false,
      showQuantities: Boolean(row.showQuantities),
      currency: row.currency || 'SYP',
      defaultCountryCode: row.defaultCountryCode || '',
      contactPhone: row.contactPhone || '',
      contactEmail: row.contactEmail || '',
      contactAddress: row.contactAddress || '',
      channelLinks: this.links(row.channelLinks || {}),
      heroImageUrl: this.localImage(row.heroImageUrl) ? row.heroImageUrl : '',
      whatsappChannelUrl: row.whatsappChannelUrl || '',
      whatsappChannelEnabled: Boolean(row.whatsappChannelEnabled),
    };
  }

  private adminOffer(row: any) {
    return {
      id: String(row._id),
      title: row.title || '',
      description: row.description || '',
      imageUrl: this.localImage(row.imageUrl) ? row.imageUrl : '',
      ctaLabel: row.ctaLabel || '',
      ctaUrl: row.ctaUrl || '',
      isActive: Boolean(row.isActive),
      startsAt: row.startsAt || null,
      endsAt: row.endsAt || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private publicAdmin(row: any) {
    return {
      id: String(row._id),
      username: row.username,
      displayName: row.displayName || row.username,
      role: (ADMIN_ROLES as string[]).includes(row.role) ? row.role : 'editor',
      isActive: Boolean(row.isActive),
      permissions: roleHasPermission(row.role, 'product:read') ? ROLE_PERMISSIONS[row.role as AdminRole] : [],
    };
  }

  private offerInput(body: any, creating: boolean): Record<string, any> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('بيانات العرض غير صالحة.');
    const result: Record<string, any> = {};
    for (const key of ['title', 'description', 'imageUrl', 'ctaLabel', 'ctaUrl', 'isActive', 'startsAt', 'endsAt']) {
      if (body[key] !== undefined) result[key] = body[key];
    }
    if (creating || 'title' in result) result.title = this.requiredString(result.title, 'عنوان العرض', 120);
    if ('description' in result) result.description = this.optionalString(result.description, 'وصف العرض', 1000);
    if ('imageUrl' in result) result.imageUrl = this.localImageOrEmpty(result.imageUrl, 'صورة العرض');
    if ('ctaLabel' in result) result.ctaLabel = this.optionalString(result.ctaLabel, 'نص زر العرض', 50);
    if ('ctaUrl' in result) result.ctaUrl = this.webUrl(result.ctaUrl, 'رابط العرض', true);
    if ('isActive' in result) result.isActive = this.boolean(result.isActive, 'حالة العرض');
    else if (creating) result.isActive = false;
    for (const field of ['startsAt', 'endsAt']) if (field in result) result[field] = this.dateOrUndefined(result[field], field === 'startsAt' ? 'تاريخ بداية العرض' : 'تاريخ نهاية العرض');
    const start = result.startsAt ?? body.startsAt;
    const end = result.endsAt ?? body.endsAt;
    if (start && end && new Date(start).getTime() > new Date(end).getTime()) throw new BadRequestException('تاريخ نهاية العرض يجب أن يأتي بعد بدايته.');
    return result;
  }

  private async isMediaReferenced(filename: string): Promise<boolean> {
    const url = `/api/media/${filename}`;
    const [product, branch, settings, offer] = await Promise.all([
      this.products.exists({ 'images.url': url }),
      this.branches.exists({ imageUrl: url }),
      this.settings.exists({ heroImageUrl: url }),
      this.offers.exists({ imageUrl: url }),
    ]);
    return Boolean(product || branch || settings || offer);
  }

  private async removeUploadedFiles(files: Express.Multer.File[] | undefined): Promise<void> {
    if (!files?.length) return;
    await Promise.all(files.map((file) => this.mediaStorage.remove(file.filename)));
  }

  private filenameFromUrl(value: unknown): string | undefined {
    if (typeof value !== 'string' || !LOCAL_IMAGE.test(value)) return undefined;
    return value.slice('/api/media/'.length);
  }

  private localImage(value: unknown): value is string {
    return typeof value === 'string' && LOCAL_IMAGE.test(value);
  }

  private localImageOrEmpty(value: unknown, label: string): string {
    const result = this.optionalString(value, label, 250);
    if (!result) return '';
    if (!this.localImage(result)) throw new BadRequestException(`${label} يجب أن تكون صورة مرفوعة عبر لوحة التحكم.`);
    return result;
  }

  private links(value: unknown): Record<string, string> {
    if (value === undefined || value === null || value === '') return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('روابط القنوات غير صالحة.');
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 15) throw new BadRequestException('يمكن إضافة 15 رابط قناة كحد أقصى.');
    const result: Record<string, string> = {};
    for (const [key, rawUrl] of entries) {
      const cleanKey = key.trim();
      if (!/^[\p{L}a-zA-Z0-9 _-]{1,40}$/u.test(cleanKey) || ['__proto__', 'prototype', 'constructor'].includes(cleanKey.toLowerCase())) throw new BadRequestException('اسم القناة غير صالح.');
      const url = this.optionalString(rawUrl, `رابط ${cleanKey}`, 500);
      if (!url) continue;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') throw new Error('protocol');
      } catch {
        throw new BadRequestException(`رابط ${cleanKey} يجب أن يبدأ بـ https://.`);
      }
      result[cleanKey] = url;
    }
    return result;
  }

  private webUrl(value: unknown, label: string, optional: boolean): string {
    const result = optional ? this.optionalString(value, label, 500) : this.requiredString(value, label, 500);
    if (!result) return '';
    try {
      const parsed = new URL(result);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      throw new BadRequestException(`${label} يجب أن يكون رابط HTTP أو HTTPS صحيحًا.`);
    }
    return result;
  }

  private email(value: unknown, label: string, optional: boolean): string {
    const result = optional ? this.optionalString(value, label, 120) : this.requiredString(value, label, 120);
    if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new BadRequestException(`${label} غير صالح.`);
    return result;
  }

  private requiredString(value: unknown, label: string, maximum: number): string {
    if (typeof value !== 'string') throw new BadRequestException(`${label} مطلوب.`);
    const result = value.trim();
    if (!result || result.length > maximum) throw new BadRequestException(`${label} مطلوب وبحد أقصى ${maximum} حرفًا.`);
    return result;
  }

  private optionalString(value: unknown, label: string, maximum: number): string {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new BadRequestException(`${label} غير صالح.`);
    const result = value.trim();
    if (result.length > maximum) throw new BadRequestException(`${label} يجب ألا يتجاوز ${maximum} حرفًا.`);
    return result;
  }

  private boolean(value: unknown, label: string): boolean {
    if (typeof value !== 'boolean') throw new BadRequestException(`${label} غير صالح.`);
    return value;
  }

  private dateOrUndefined(value: unknown, label: string): Date | undefined {
    if (value === null || value === '') return undefined;
    if (typeof value !== 'string' && !(value instanceof Date)) throw new BadRequestException(`${label} غير صالح.`);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${label} غير صالح.`);
    return date;
  }

  private username(value: unknown): string {
    const result = this.requiredString(value, 'اسم المستخدم', 40).toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(result)) throw new BadRequestException('اسم المستخدم يجب أن يكون بين 3 و40 حرفًا لاتينيًا أو رقمًا.');
    return result;
  }

  private password(value: unknown): string {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) {
      throw new BadRequestException('كلمة المرور يجب أن تتراوح بين 12 و128 حرفًا.');
    }
    return value;
  }

  private role(value: unknown): AdminRole {
    if (typeof value !== 'string' || !(ADMIN_ROLES as string[]).includes(value)) throw new BadRequestException('صلاحية الحساب غير صالحة.');
    return value as AdminRole;
  }

  private pageNumber(value: unknown, fallback: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? Math.min(5000, number) : fallback;
  }

  private async ensureAnotherOwner(excludedId: string) {
    const activeOwners = await this.admins.countDocuments({ role: 'owner', isActive: true, _id: { $ne: excludedId } });
    if (activeOwners < 1) throw new BadRequestException('يجب إبقاء حساب مالك نشط واحد على الأقل.');
  }

  private cleanLegacyDetails(value: any): any {
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => this.cleanLegacyDetails(item));
    if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 300) : value;
    const result: Record<string, any> = {};
    for (const [key, nested] of Object.entries(value).slice(0, 50)) {
      if (/telegram|token|password|secret/i.test(key)) continue;
      result[key] = this.cleanLegacyDetails(nested);
    }
    return result;
  }

  private async log(admin: AdminRecord, action: string, targetType: string, targetId: string, details: Record<string, any> = {}) {
    await this.audit.create({ adminId: admin._id, adminUsername: admin.username, action, targetType, targetId, details });
  }
}
