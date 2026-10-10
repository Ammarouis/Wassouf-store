// Shared contracts for the public store and the administration dashboard.

export type ProductStatus = 'draft' | 'published' | 'hidden' | 'archived';
export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'ask_to_confirm';
export type AdminRole = 'owner' | 'admin' | 'editor' | 'inventory_manager';

export const ADMIN_ROLES: AdminRole[] = ['owner', 'admin', 'editor', 'inventory_manager'];
export const PRODUCT_STATUSES: ProductStatus[] = ['draft', 'published', 'hidden', 'archived'];
export const AVAILABILITY_STATUSES: AvailabilityStatus[] = ['in_stock', 'out_of_stock', 'ask_to_confirm'];

export const AVAILABILITY_LABELS_AR: Record<AvailabilityStatus, string> = {
  in_stock: 'متوفر',
  out_of_stock: 'غير متوفر حاليًا',
  ask_to_confirm: 'يرجى التواصل للتأكد',
};

export type Permission =
  | 'product:read' | 'product:create' | 'product:edit' | 'product:visibility' | 'product:archive' | 'product:delete'
  | 'inventory:edit' | 'branch:read' | 'branch:edit' | 'settings:edit' | 'offers:edit'
  | 'stats:view' | 'admins:manage';

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  owner: ['product:read', 'product:create', 'product:edit', 'product:visibility', 'product:archive', 'product:delete', 'inventory:edit', 'branch:read', 'branch:edit', 'settings:edit', 'offers:edit', 'stats:view', 'admins:manage'],
  admin: ['product:read', 'product:create', 'product:edit', 'product:visibility', 'product:archive', 'inventory:edit', 'branch:read', 'branch:edit', 'settings:edit', 'offers:edit', 'stats:view'],
  editor: ['product:read', 'product:create', 'product:edit', 'product:visibility', 'inventory:edit', 'branch:read', 'stats:view'],
  inventory_manager: ['product:read', 'inventory:edit', 'branch:read', 'stats:view'],
};

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export interface PublicBranchAvailability {
  branchCode: string;
  branchName: string;
  status: AvailabilityStatus;
  statusLabel: string;
  quantity?: number;
  whatsappUrl?: string;
}

export interface PublicImage {
  index: number;
  url: string;
  alt?: string;
}

export interface PublicProduct {
  productCode: string;
  slug: string;
  name: string;
  brand: string;
  model?: string;
  description?: string;
  specifications: Record<string, string>;
  price?: number;
  currency?: string;
  images: PublicImage[];
  isNew: boolean;
  isFeatured: boolean;
  availability: PublicBranchAvailability[];
  publishedAt: string;
  isDemo?: boolean;
}

export interface PublicBranch {
  branchCode: string;
  name: string;
  address: string;
  whatsappUrl?: string;
  phone?: string;
  email?: string;
  contactInfo?: string;
  channelLinks?: Record<string, string>;
  mapsUrl?: string;
  imageUrl?: string;
  isDemo?: boolean;
}

export interface PublicSettings {
  storeName: string;
  about: string;
  showPrices: boolean;
  showQuantities: boolean;
  currency: string;
  contactPhone?: string;
  contactEmail?: string;
  contactAddress?: string;
  channelLinks?: Record<string, string>;
  heroImageUrl?: string;
  whatsappChannelUrl?: string;
  demoMode: boolean;
}

export interface PublicOffer {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchQuery {
  q?: string;
  brand?: string;
  branch?: string;
  availability?: AvailabilityStatus;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
}

export interface PublicStats {
  publishedProducts: number;
  brands: number;
  searchesToday: number;
  whatsappClicksToday: number;
  topSearches: { term: string; count: number }[];
  isDemo: boolean;
}

// ---------- Text normalization (Arabic + English search) ----------
const AR_DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeText(input: string): string {
  if (!input) return '';
  let s = input.normalize('NFKC');
  s = s.replace(AR_DIACRITICS, '');
  s = s.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export const BRAND_ALIASES: Record<string, string[]> = {
  samsung: ['سامسونج', 'سامسونغ', 'سمسونج'],
  apple: ['ابل', 'أبل', 'ايفون', 'آيفون', 'iphone'],
  xiaomi: ['شاومي', 'شياومي', 'ريدمي', 'redmi', 'poco', 'بوكو'],
  huawei: ['هواوي'],
  oppo: ['اوبو', 'أوبو'],
  realme: ['ريلمي'],
  honor: ['هونر', 'اونر'],
  infinix: ['انفينكس'],
  tecno: ['تكنو'],
  vivo: ['فيفو'],
  nokia: ['نوكيا'],
  oneplus: ['ون بلس', 'وان بلس'],
  google: ['جوجل', 'بكسل', 'pixel'],
};

export function searchKeywords(...parts: (string | undefined)[]): string {
  const base = normalizeText(parts.filter(Boolean).join(' '));
  const extra: string[] = [];
  for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
    if (base.includes(brand) || aliases.some((alias) => base.includes(normalizeText(alias)))) {
      extra.push(brand, ...aliases.map(normalizeText));
    }
  }
  return Array.from(new Set((base + ' ' + extra.join(' ')).split(' ').filter(Boolean))).join(' ');
}

// ---------- WhatsApp phone normalization ----------
export interface PhoneResult { ok: boolean; e164?: string; error?: string; }

/** Normalize a local number without guessing its country code. */
export function normalizeWhatsAppNumber(local: string, countryCode?: string): PhoneResult {
  if (!local) return { ok: false, error: 'الرقم فارغ' };
  let digits = local.normalize('NFKC')
    .replace(/[٠-٩]/g, (digit) => String(AR_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(FA_DIGITS.indexOf(digit)))
    .replace(/[\s\-().]/g, '');
  let hasPlus = digits.startsWith('+');
  digits = digits.replace(/^\+/, '');
  if (digits.startsWith('00')) { digits = digits.slice(2); hasPlus = true; }
  if (!/^\d+$/.test(digits)) return { ok: false, error: 'الرقم يجب أن يحتوي أرقامًا فقط' };

  const cc = (countryCode ?? '').replace(/\D/g, '').replace(/^00/, '');
  if (cc && !/^[1-9]\d{0,2}$/.test(cc)) return { ok: false, error: 'رمز الدولة غير صالح' };

  let international: string;
  if (hasPlus || (!digits.startsWith('0') && cc && digits.startsWith(cc) && digits.length > 9)) {
    international = digits;
  } else if (digits.startsWith('0')) {
    if (!cc) return { ok: false, error: 'الرقم محلي: يلزم ضبط رمز الدولة (مثال 963) في إعدادات الفرع' };
    international = cc + digits.replace(/^0+/, '');
  } else {
    if (!cc) return { ok: false, error: 'تعذر تحديد رمز الدولة: يلزم ضبطه' };
    international = cc + digits;
  }
  if (international.length < 8 || international.length > 15) return { ok: false, error: 'طول الرقم غير صالح' };
  return { ok: true, e164: international };
}

export function buildWhatsAppUrl(e164: string | undefined, message?: string): string | undefined {
  if (!e164 || !/^\d{8,15}$/.test(e164)) return undefined;
  const url = `https://wa.me/${e164}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

export function productInquiryMessage(productName: string, productUrl: string): string {
  return `مرحبًا، أريد الاستفسار عن ${productName}\n${productUrl}`;
}

export function isValidHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export function isValidWhatsAppChannelUrl(value: string): boolean {
  if (!isValidHttpsUrl(value)) return false;
  const hostname = new URL(value).hostname;
  return hostname === 'whatsapp.com' || hostname.endsWith('.whatsapp.com') || hostname === 'wa.me';
}

export const NEW_ARRIVAL_DAYS = 14;
export function isNewArrival(publishedAt: Date | string, now = new Date()): boolean {
  const timestamp = new Date(publishedAt).getTime();
  return now.getTime() - timestamp <= NEW_ARRIVAL_DAYS * 86400000 && now.getTime() >= timestamp;
}

export function formatProductCode(sequence: number): string {
  return `WSF-${String(sequence).padStart(6, '0')}`;
}
