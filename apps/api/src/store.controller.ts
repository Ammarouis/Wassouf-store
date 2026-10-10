import { BadRequestException, Controller, Get, NotFoundException, Post, Body, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AVAILABILITY_LABELS_AR,
  AVAILABILITY_STATUSES,
  AvailabilityStatus,
  buildWhatsAppUrl,
  isNewArrival,
  isValidWhatsAppChannelUrl,
  normalizeText,
  normalizeWhatsAppNumber,
  PublicBranch,
  PublicProduct,
  searchKeywords,
} from '@wassouf/shared';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MEDIA_URL_PATTERN = /^\/api\/media\/[a-f\d-]{36}\.(?:jpg|png|webp|gif)$/i;

@Controller()
export class StoreController {
  constructor(
    @InjectModel('Product') private readonly products: Model<any>,
    @InjectModel('Branch') private readonly branches: Model<any>,
    @InjectModel('Inventory') private readonly inventory: Model<any>,
    @InjectModel('StoreSettings') private readonly settings: Model<any>,
    @InjectModel('AnalyticsEvent') private readonly events: Model<any>,
    @InjectModel('Offer') private readonly offers: Model<any>,
  ) {}

  private async setting(): Promise<any> {
    return (await this.settings.findOne({ key: 'global_settings' }).lean()) || {
      storeName: 'الوسوف للاتصالات',
      about: 'متجر الوسوف لأحدث الهواتف المحمولة والإكسسوارات.',
      showPrices: true,
      showQuantities: false,
      currency: 'SYP',
      channelLinks: {},
      whatsappChannelEnabled: false,
    };
  }

  @Get('/health')
  health() { return { status: 'ok', timestamp: new Date().toISOString() }; }

  @Get('/api/settings/public')
  async publicSettings() {
    const settings = await this.setting();
    return {
      storeName: settings.storeName,
      about: settings.about,
      showPrices: Boolean(settings.showPrices),
      showQuantities: Boolean(settings.showQuantities),
      currency: settings.currency || 'SYP',
      ...(settings.contactPhone ? { contactPhone: settings.contactPhone } : {}),
      ...(settings.contactEmail ? { contactEmail: settings.contactEmail } : {}),
      ...(settings.contactAddress ? { contactAddress: settings.contactAddress } : {}),
      channelLinks: this.safeLinks(settings.channelLinks),
      ...(this.localImageUrl(settings.heroImageUrl) ? { heroImageUrl: settings.heroImageUrl } : {}),
      ...(settings.whatsappChannelEnabled && isValidWhatsAppChannelUrl(settings.whatsappChannelUrl) ? { whatsappChannelUrl: settings.whatsappChannelUrl } : {}),
      demoMode: false,
    };
  }

  @Get('/api/products')
  async list(@Query() query: any) {
    const page = this.pageNumber(query.page, 1);
    const pageSize = Math.min(48, this.pageNumber(query.pageSize, 12));
    const filter: any = { status: 'published', isDemo: { $ne: true } };
    if (typeof query.brand === 'string' && query.brand.trim()) {
      filter.brand = { $regex: `^${escapeRegex(query.brand.trim())}$`, $options: 'i' };
    }
    if (typeof query.q === 'string' && query.q.trim()) {
      const normalized = normalizeText(query.q.slice(0, 100));
      const terms = searchKeywords(query.q).split(' ').filter(Boolean).slice(0, 8).map(escapeRegex);
      const namePattern = normalized.split(' ').filter(Boolean).map(escapeRegex).join('.*');
      filter.$or = [
        ...(terms.length ? [{ searchKeywords: { $regex: terms.join('|'), $options: 'i' } }] : []),
        ...(namePattern ? [{ name: { $regex: namePattern, $options: 'i' } }] : []),
        ...(normalized ? [{ brand: { $regex: escapeRegex(normalized), $options: 'i' } }, { model: { $regex: escapeRegex(normalized), $options: 'i' } }] : []),
      ];
    }
    const priceRange: any = {};
    if (query.minPrice !== undefined && query.minPrice !== '') priceRange.$gte = this.parsePrice(query.minPrice, 'الحد الأدنى للسعر');
    if (query.maxPrice !== undefined && query.maxPrice !== '') priceRange.$lte = this.parsePrice(query.maxPrice, 'الحد الأعلى للسعر');
    if (Object.keys(priceRange).length) filter.price = priceRange;

    const [rows, settings, activeBranches] = await Promise.all([
      this.products.find(filter).sort({ publishedAt: -1, createdAt: -1 }).limit(5000).lean(),
      this.setting(),
      this.branches.find({ isActive: true }).sort({ name: 1 }).lean(),
    ]);
    const inventoryRows = rows.length
      ? await this.inventory.find({ productId: { $in: rows.map((row: any) => row._id) } }).lean()
      : [];
    const mapped = this.deduplicateProducts(rows).map((row: any) => this.publicProduct(row, settings, activeBranches, inventoryRows));
    const branchCode = typeof query.branch === 'string' ? query.branch.trim() : '';
    const filtered = mapped.filter((product: PublicProduct) => {
      const hasBranch = !branchCode || product.availability.some((availability) => availability.branchCode === branchCode);
      const hasAvailability = !query.availability || (AVAILABILITY_STATUSES as string[]).includes(query.availability)
        && product.availability.some((availability) => availability.status === query.availability);
      return hasBranch && hasAvailability;
    });
    const start = (page - 1) * pageSize;
    return { items: filtered.slice(start, start + pageSize), total: filtered.length, page, pageSize };
  }

  @Get('/api/products/latest')
  async latest(@Query('limit') limit?: string) {
    const count = Math.min(20, Math.max(1, this.pageNumber(limit, 8)));
    const [rows, settings, branches] = await Promise.all([
      this.products.find({ status: 'published', isDemo: { $ne: true } }).sort({ publishedAt: -1, createdAt: -1 }).limit(Math.min(100, count * 5)).lean(),
      this.setting(),
      this.branches.find({ isActive: true }).sort({ name: 1 }).lean(),
    ]);
    const inventoryRows = rows.length ? await this.inventory.find({ productId: { $in: rows.map((row: any) => row._id) } }).lean() : [];
    return this.deduplicateProducts(rows).slice(0, count).map((row: any) => this.publicProduct(row, settings, branches, inventoryRows));
  }

  @Get('/api/products/suggest')
  async suggest(@Query('q') query = '') {
    if (!query.trim()) return { suggestions: [], products: [] };
    const result = await this.list({ q: query, page: 1, pageSize: 5 });
    return { suggestions: result.items.map((product: PublicProduct) => product.name), products: result.items };
  }

  @Get('/api/products/:code')
  async product(@Param('code') code: string) {
    const row: any = await this.products.findOne({ productCode: code, status: 'published', isDemo: { $ne: true } }).lean();
    if (!row) throw new NotFoundException('المنتج غير موجود.');
    const [settings, branches, inventoryRows] = await Promise.all([
      this.setting(),
      this.branches.find({ isActive: true }).sort({ name: 1 }).lean(),
      this.inventory.find({ productId: row._id }).lean(),
    ]);
    return this.publicProduct(row, settings, branches, inventoryRows);
  }

  @Get('/api/brands')
  async brands() {
    const rows = await this.products.aggregate([
      { $match: { status: 'published', isDemo: { $ne: true } } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    return rows.map((row: any) => ({ name: row._id, count: row.count }));
  }

  @Get('/api/branches')
  async publicBranches(): Promise<PublicBranch[]> {
    const [rows, settings] = await Promise.all([
      this.branches.find({ isActive: true }).sort({ name: 1 }).lean(),
      this.setting(),
    ]);
    return rows.map((branch: any) => {
      const number = this.whatsappNumber(branch, settings);
      const imageUrl = this.localImageUrl(branch.imageUrl) ? branch.imageUrl : undefined;
      const mapsUrl = this.isWebUrl(branch.mapsUrl) ? branch.mapsUrl : undefined;
      return {
        branchCode: branch.branchCode,
        name: branch.name,
        address: branch.address || '',
        ...(buildWhatsAppUrl(number) ? { whatsappUrl: buildWhatsAppUrl(number) } : {}),
        ...(branch.phone ? { phone: branch.phone } : {}),
        ...(branch.email ? { email: branch.email } : {}),
        ...(branch.contactInfo ? { contactInfo: branch.contactInfo } : {}),
        channelLinks: this.safeLinks(branch.channelLinks),
        ...(mapsUrl ? { mapsUrl } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      };
    });
  }

  @Get('/api/offers/public')
  async publicOffers() {
    const now = new Date();
    const rows = await this.offers.find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    }).sort({ createdAt: -1 }).limit(8).lean();
    return rows.map((row: any) => ({
      id: String(row._id),
      title: row.title,
      ...(row.description ? { description: row.description } : {}),
      ...(this.localImageUrl(row.imageUrl) ? { imageUrl: row.imageUrl } : {}),
      ...(row.ctaLabel ? { ctaLabel: row.ctaLabel } : {}),
      ...(this.isWebUrl(row.ctaUrl) ? { ctaUrl: row.ctaUrl } : {}),
    }));
  }

  @Post('/api/analytics/event')
  async event(@Body() body: any) {
    const allowed = ['search', 'whatsapp_click', 'product_view'];
    if (!allowed.includes(body?.type)) throw new BadRequestException('نوع الحدث غير صالح.');
    await this.events.create({
      type: body.type,
      term: typeof body.term === 'string' ? body.term.trim().slice(0, 120) : '',
      productCode: typeof body.productCode === 'string' ? body.productCode.slice(0, 50) : '',
      branchCode: typeof body.branchCode === 'string' ? body.branchCode.slice(0, 30) : '',
    });
    return { success: true };
  }

  private deduplicateProducts(rows: any[]): any[] {
    const seen = new Set<string>();
    return rows.filter((row: any) => {
      const brand = normalizeText(String(row.brand || ''));
      const identity = normalizeText(String(row.model || row.name || ''));
      const key = `${brand}|${identity || String(row.productCode || row._id)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private publicProduct(product: any, settings: any, branches: any[], inventoryRows: any[]): PublicProduct {
    const stock = inventoryRows.filter((row: any) => String(row.productId) === String(product._id));
    const availability = branches.map((branch: any) => {
      const row = stock.find((entry: any) => entry.branchCode === branch.branchCode || (entry.branchId && String(entry.branchId) === String(branch._id)));
      const status = (AVAILABILITY_STATUSES as string[]).includes(row?.availabilityStatus)
        ? row.availabilityStatus as AvailabilityStatus
        : 'ask_to_confirm';
      const number = this.whatsappNumber(branch, settings);
      const message = `مرحباً، أود الاستفسار عن ${product.name} (${product.productCode}).`;
      return {
        branchCode: branch.branchCode,
        branchName: branch.name,
        status,
        statusLabel: AVAILABILITY_LABELS_AR[status],
        ...(settings.showQuantities && row?.quantity !== undefined && row?.quantity !== null && row?.quantity !== '' && Number.isFinite(Number(row.quantity)) ? { quantity: Number(row.quantity) } : {}),
        ...(buildWhatsAppUrl(number, message) ? { whatsappUrl: buildWhatsAppUrl(number, message) } : {}),
      };
    });
    const publishedAt = new Date(product.publishedAt || product.createdAt || Date.now());
    const images = (Array.isArray(product.images) ? product.images : []).flatMap((image: any, index: number) => {
      const url = typeof image === 'string' ? image : image?.url;
      if (!this.localImageUrl(url)) return [];
      return [{ index, url, ...(typeof image?.alt === 'string' ? { alt: image.alt } : {}) }];
    });
    const specifications = product.specifications instanceof Map
      ? Object.fromEntries(product.specifications)
      : product.specifications && typeof product.specifications === 'object' && !Array.isArray(product.specifications)
        ? product.specifications : {};
    return {
      productCode: product.productCode,
      slug: String(product.productCode || '').toLowerCase(),
      name: product.name,
      brand: product.brand,
      ...(product.model ? { model: product.model } : {}),
      ...(product.description ? { description: product.description } : {}),
      specifications,
      ...(settings.showPrices && Number.isFinite(product.price) ? { price: product.price, currency: product.currency || settings.currency || 'SYP' } : {}),
      images,
      isNew: isNewArrival(publishedAt),
      isFeatured: Boolean(product.isFeatured),
      availability,
      publishedAt: publishedAt.toISOString(),
    };
  }

  private whatsappNumber(branch: any, settings: any): string | undefined {
    if (typeof branch.whatsappE164 === 'string' && /^\d{8,15}$/.test(branch.whatsappE164)) return branch.whatsappE164;
    return normalizeWhatsAppNumber(branch.whatsappLocalNumber || '', branch.whatsappCountryCode || settings.defaultCountryCode || '').e164;
  }

  private localImageUrl(value: unknown): value is string {
    return typeof value === 'string' && MEDIA_URL_PATTERN.test(value);
  }

  private safeLinks(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const safe: Record<string, string> = {};
    for (const [key, url] of Object.entries(value as Record<string, unknown>)) {
      if (/^[a-zA-Z][\w -]{0,30}$/.test(key) && !['__proto__', 'prototype', 'constructor'].includes(key.toLowerCase()) && typeof url === 'string' && this.isWebUrl(url)) safe[key] = url;
    }
    return safe;
  }

  private isWebUrl(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }

  private pageNumber(value: unknown, fallback: number): number {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(5000, parsed) : fallback;
  }

  private parsePrice(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException(`${label} غير صالح.`);
    return parsed;
  }
}
