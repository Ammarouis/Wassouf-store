import {
  PublicProduct,
  PublicBranch,
  PublicSettings,
  PaginatedResult,
  SearchQuery,
  PublicOffer,
} from '@wassouf/shared';
import { withScheme } from './site';

const getBaseUrl = () => {
  if (typeof window !== 'undefined') return '';
  return withScheme(process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL) || 'http://localhost:4000';
};

const DEFAULT_SETTINGS: PublicSettings = {
  storeName: 'الوسوف للاتصالات',
  about: 'متجر الوسوف للاتصالات — وجهتكم الأولى لأحدث الهواتف الذكية والأجهزة الإلكترونية بجميع فروعنا.',
  showPrices: true,
  showQuantities: false,
  currency: 'SYP',
  demoMode: false,
};

async function fetchJson<T>(url: string, init?: RequestInit, fallback?: T): Promise<T> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Accept': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) {
      if (fallback !== undefined) return fallback;
      throw new Error(`API call failed with status ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    console.warn(`[API Fetch Warning] ${url}:`, (err as Error).message);
    throw err;
  }
}

export async function getSettings(): Promise<PublicSettings> {
  const baseUrl = getBaseUrl();
  return fetchJson<PublicSettings>(
    `${baseUrl}/api/settings/public`,
    { next: { revalidate: 60, tags: ['settings'] } },
    DEFAULT_SETTINGS
  );
}

export async function getProducts(query: SearchQuery = {}): Promise<PaginatedResult<PublicProduct>> {
  const baseUrl = getBaseUrl();
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.brand) params.set('brand', query.brand);
  if (query.branch) params.set('branch', query.branch);
  if (query.availability) params.set('availability', query.availability);
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));

  const qs = params.toString();
  const url = `${baseUrl}/api/products${qs ? `?${qs}` : ''}`;

  return fetchJson<PaginatedResult<PublicProduct>>(
    url,
    { next: { revalidate: 60, tags: ['products'] } },
    { items: [], total: 0, page: query.page || 1, pageSize: query.pageSize || 12 }
  );
}

export async function getLatestProducts(limit = 6): Promise<PublicProduct[]> {
  const baseUrl = getBaseUrl();
  return fetchJson<PublicProduct[]>(
    `${baseUrl}/api/products/latest?limit=${limit}`,
    { next: { revalidate: 60, tags: ['products'] } },
    []
  );
}

export async function getProduct(productCode: string): Promise<PublicProduct | null> {
  const baseUrl = getBaseUrl();
  return fetchJson<PublicProduct | null>(
    `${baseUrl}/api/products/${encodeURIComponent(productCode)}`,
    { next: { revalidate: 60, tags: [`product:${productCode}`] } },
    null
  );
}

export async function getBrands(): Promise<{ name: string; count: number }[]> {
  const baseUrl = getBaseUrl();
  return fetchJson<{ name: string; count: number }[]>(
    `${baseUrl}/api/brands`,
    { next: { revalidate: 60, tags: ['brands', 'products'] } },
    []
  );
}

export async function getBranches(): Promise<PublicBranch[]> {
  const baseUrl = getBaseUrl();
  return fetchJson<PublicBranch[]>(
    `${baseUrl}/api/branches`,
    { next: { revalidate: 60, tags: ['branches'] } },
    []
  );
}

export async function getOffers(): Promise<PublicOffer[]> {
  const baseUrl = getBaseUrl();
  return fetchJson<PublicOffer[]>(
    `${baseUrl}/api/offers/public`,
    { next: { revalidate: 60, tags: ['offers'] } },
    []
  );
}

export async function getProductSuggestions(q: string): Promise<{ suggestions: string[]; products: PublicProduct[] }> {
  if (!q || !q.trim()) return { suggestions: [], products: [] };
  const baseUrl = getBaseUrl();
  return fetchJson<{ suggestions: string[]; products: PublicProduct[] }>(
    `${baseUrl}/api/products/suggest?q=${encodeURIComponent(q.trim())}`,
    { cache: 'no-store' },
    { suggestions: [], products: [] }
  );
}
