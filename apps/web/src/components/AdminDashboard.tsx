'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from './BrandLogo';
import { BrandPicker } from './BrandPicker';
import {
  Activity, Archive, ArrowLeft, BadgePercent, BarChart3, Building2, Check, ChevronDown, CircleAlert, Clock3,
  Eye, EyeOff, ImagePlus, LayoutDashboard, LoaderCircle, LogOut, MapPin, Menu, MessageCircle, Package,
  Pencil, Plus, Save, Search, Settings2, ShieldCheck, Smartphone, Trash2, UserRound, Users, X,
} from 'lucide-react';

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: 'owner' | 'admin' | 'editor' | 'inventory_manager';
  isActive: boolean;
  permissions: string[];
}
interface ProductImage { assetId: string; url: string; alt?: string; originalName?: string; size?: number; }
interface InventoryItem { branchCode: string; branchName?: string; availabilityStatus: string; quantity: number | null; }
interface Product {
  id: string; productCode: string; name: string; brand: string; model: string; description: string;
  specifications: Record<string, string>; price?: number; currency: string; status: string; isFeatured: boolean;
  images: ProductImage[]; legacyImagesCount?: number; inventory: InventoryItem[]; updatedAt?: string;
}
interface Branch {
  id: string; branchCode: string; name: string; address: string; whatsappLocalNumber: string;
  whatsappCountryCode: string; whatsappE164: string; phone: string; email: string; contactInfo: string;
  channelLinks: Record<string, string>; mapsUrl: string; imageUrl: string; isActive: boolean;
}
interface StoreSettings {
  storeName: string; about: string; showPrices: boolean; showQuantities: boolean; currency: string;
  defaultCountryCode: string; contactPhone: string; contactEmail: string; contactAddress: string;
  channelLinks: Record<string, string>; heroImageUrl: string; whatsappChannelUrl: string; whatsappChannelEnabled: boolean;
}
interface Offer {
  id: string; title: string; description: string; imageUrl: string; ctaLabel: string; ctaUrl: string;
  isActive: boolean; startsAt: string | null; endsAt: string | null;
}
interface Stats {
  publishedProducts: number; brands: number; searchesToday: number; whatsappClicksToday: number;
  activeBranches: number; activeOffers: number; activeAdmins: number; topSearches: { term: string; count: number }[];
}
interface AuditEntry { id: string; action: string; adminUsername: string; targetType: string; targetId: string; details: any; createdAt?: string; }
interface InventoryDraft { branchCode: string; availabilityStatus: string; quantity: string; }
interface ProductDraft {
  id?: string; productCode?: string; name: string; brand: string; model: string; description: string;
  specsText: string; price: string; currency: string; isFeatured: boolean; inventory: InventoryDraft[]; images: ProductImage[];
}
interface BranchDraft {
  id?: string; branchCode: string; name: string; address: string; whatsappLocalNumber: string;
  whatsappCountryCode: string; phone: string; email: string; contactInfo: string; channelLinksText: string;
  mapsUrl: string; isActive: boolean;
}
interface OfferDraft {
  id?: string; title: string; description: string; imageUrl: string; ctaLabel: string; ctaUrl: string;
  isActive: boolean; startsAt: string; endsAt: string;
}
interface TeamDraft { id?: string; username: string; displayName: string; role: AdminUser['role']; isActive: boolean; password: string; }

type Section = 'overview' | 'products' | 'branches' | 'offers' | 'settings' | 'admins' | 'activity';
type Notice = { kind: 'success' | 'error' | 'info'; text: string };

const roleNames: Record<AdminUser['role'], string> = {
  owner: 'مالك المتجر', admin: 'مدير', editor: 'محرر المنتجات', inventory_manager: 'مسؤول المخزون',
};
const statusNames: Record<string, string> = {
  draft: 'مسودة', published: 'منشور', hidden: 'مخفي', archived: 'مؤرشف',
};
const availabilityNames: Record<string, string> = {
  in_stock: 'متوفر', out_of_stock: 'غير متوفر', ask_to_confirm: 'يرجى التأكد',
};
const emptySettings: StoreSettings = {
  storeName: 'الوسوف للاتصالات', about: '', showPrices: true, showQuantities: false, currency: 'SYP',
  defaultCountryCode: '', contactPhone: '', contactEmail: '', contactAddress: '', channelLinks: {},
  heroImageUrl: '', whatsappChannelUrl: '', whatsappChannelEnabled: false,
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('x-admin-request', '1');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join('، ') : body?.message;
    throw new Error(message || `تعذّر إكمال الطلب (${response.status}).`);
  }
  return body as T;
}
function jsonBody(value: unknown) { return JSON.stringify(value); }
function parseLinks(text: string): Record<string, string> {
  return Object.fromEntries(text.split('\n').map((line) => line.split('|').map((part) => part.trim())).filter((parts) => parts.length >= 2 && parts[0] && parts[1]));
}
function linksText(value?: Record<string, string>) {
  return Object.entries(value || {}).map(([name, url]) => `${name} | ${url}`).join('\n');
}
function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function formatBytes(value?: number) {
  if (!value) return '';
  return value < 1024 * 1024 ? `${Math.round(value / 1024)} ك.ب` : `${(value / (1024 * 1024)).toFixed(1)} م.ب`;
}
function specsToText(specs: Record<string, string> = {}) {
  return Object.entries(specs).map(([key, value]) => `${key}: ${value}`).join('\n');
}
function textToSpecs(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  for (const line of lines) {
    const splitAt = line.search(/[:=：]/);
    if (splitAt < 1 || !line.slice(splitAt + 1).trim()) throw new Error(`صيغة المواصفة غير صحيحة: ${line}`);
    result[line.slice(0, splitAt).trim()] = line.slice(splitAt + 1).trim();
  }
  return result;
}
function imagePreview(image?: string) {
  return image || '';
}

export function AdminDashboard() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(emptySettings);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [productStatus, setProductStatus] = useState('');
  const [productForm, setProductForm] = useState<ProductDraft | null>(null);
  const [productFiles, setProductFiles] = useState<File[]>([]);
  const [branchForm, setBranchForm] = useState<BranchDraft | null>(null);
  const [offerForm, setOfferForm] = useState<OfferDraft | null>(null);
  const [offerFile, setOfferFile] = useState<File | null>(null);
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const [teamForm, setTeamForm] = useState<TeamDraft | null>(null);
  const [stockForm, setStockForm] = useState<{ product: Product; inventory: InventoryDraft[] } | null>(null);
  const [passwordForm, setPasswordForm] = useState<{ currentPassword: string; newPassword: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const can = useCallback((permission: string) => Boolean(user?.permissions.includes(permission)), [user]);
  const reload = () => setReloadKey((value) => value + 1);
  const notify = (kind: Notice['kind'], text: string) => {
    setNotice({ kind, text });
    window.setTimeout(() => setNotice((current) => current?.text === text ? null : current), 4500);
  };

  useEffect(() => {
    let live = true;
    request<AdminUser>('/api/admin/me').then((activeUser) => {
      if (live) setUser(activeUser);
    }).catch((reason: Error) => {
      if (live && !/انتهت الجلسة|يلزم تسجيل الدخول|الحساب غير نشط/i.test(reason.message)) setError(reason.message);
    }).finally(() => { if (live) setAuthLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    setSectionLoading(true);
    setError('');
    const load = async () => {
      try {
        if (section === 'overview') setStats(await request<Stats>('/api/admin/stats'));
        if (section === 'products') {
          const params = new URLSearchParams({ page: '1', pageSize: '100' });
          if (productQuery.trim()) params.set('q', productQuery.trim());
          if (productStatus) params.set('status', productStatus);
          const result = await request<{ items: Product[] }>(`/api/admin/products?${params}`);
          if (live) setProducts(result.items);
        }
        if (section === 'branches' || section === 'products' || section === 'overview') {
          const result = await request<Branch[]>('/api/admin/branches');
          if (live) setBranches(result);
        }
        if (section === 'offers') {
          const result = await request<Offer[]>('/api/admin/offers');
          if (live) setOffers(result);
        }
        if (section === 'settings') {
          const result = await request<StoreSettings>('/api/admin/settings');
          if (live) setSettings({ ...emptySettings, ...result });
        }
        if (section === 'admins') {
          const result = await request<AdminUser[]>('/api/admin/admins');
          if (live) setAdmins(result);
        }
        if (section === 'activity') {
          const result = await request<{ items: AuditEntry[] }>('/api/admin/audit-logs?page=1&pageSize=100');
          if (live) setAuditLogs(result.items);
        }
      } catch (reason) {
        if (live) setError(reason instanceof Error ? reason.message : 'تعذر تحميل البيانات.');
      } finally {
        if (live) setSectionLoading(false);
      }
    };
    void load();
    return () => { live = false; };
  }, [user, section, reloadKey, productQuery, productStatus]);

  const previewUrls = useMemo(() => productFiles.map((file) => URL.createObjectURL(file)), [productFiles]);
  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await request('/api/admin/auth/login', { method: 'POST', body: jsonBody({ username: loginName, password: loginPassword }) });
      const activeUser = await request<AdminUser>('/api/admin/me');
      setUser(activeUser);
      setLoginPassword('');
      setSection(activeUser.permissions.includes('stats:view') ? 'overview' : 'products');
      notify('success', 'تم تسجيل الدخول إلى لوحة التحكم.');
    } catch (reason) {
      setLoginError(reason instanceof Error ? reason.message : 'تعذر تسجيل الدخول.');
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    try { await request('/api/admin/auth/logout', { method: 'POST', body: '{}' }); }
    catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر إنهاء الجلسة.'); return; }
    setUser(null);
    setSection('overview');
    notify('info', 'تم تسجيل الخروج بأمان.');
  };

  const sections = [
    { id: 'overview' as const, title: 'نظرة عامة', Icon: LayoutDashboard, permission: 'stats:view' },
    { id: 'products' as const, title: 'الهواتف والمنتجات', Icon: Smartphone, permission: 'product:read' },
    { id: 'branches' as const, title: 'الفروع والتوفر', Icon: Building2, permission: 'branch:read' },
    { id: 'offers' as const, title: 'العروض', Icon: BadgePercent, permission: 'offers:edit' },
    { id: 'settings' as const, title: 'إعدادات المتجر', Icon: Settings2, permission: 'settings:edit' },
    { id: 'admins' as const, title: 'فريق الإدارة', Icon: Users, permission: 'admins:manage' },
    { id: 'activity' as const, title: 'سجل النشاط', Icon: Activity, permission: 'stats:view' },
  ].filter((item) => can(item.permission));

  const openProductForm = async (product?: Product) => {
    let branchList = branches;
    if (!branchList.length) {
      try { branchList = await request<Branch[]>('/api/admin/branches'); setBranches(branchList); }
      catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر تحميل الفروع.'); return; }
    }
    const currentInventory = new Map((product?.inventory || []).map((entry) => [entry.branchCode, entry]));
    setProductFiles([]);
    setProductForm({
      id: product?.id,
      productCode: product?.productCode,
      name: product?.name || '', brand: product?.brand || '', model: product?.model || '',
      description: product?.description || '', specsText: specsToText(product?.specifications),
      price: product?.price === undefined ? '' : String(product.price), currency: product?.currency || settings.currency || 'SYP',
      isFeatured: Boolean(product?.isFeatured),
      inventory: branchList.map((branch) => {
        const entry = currentInventory.get(branch.branchCode);
        return { branchCode: branch.branchCode, availabilityStatus: entry?.availabilityStatus || 'ask_to_confirm', quantity: entry?.quantity == null ? '' : String(entry.quantity) };
      }),
      images: product?.images || [],
    });
  };

  const saveProduct = async (event: FormEvent<HTMLFormElement>, publish: boolean) => {
    event.preventDefault();
    if (!productForm) return;
    // The brand picker is not a native input, so `required` cannot cover it.
    if (!productForm.brand.trim()) { notify('error', 'اختر ماركة الهاتف من القائمة.'); return; }
    setSaving(true);
    try {
      const payload = {
        name: productForm.name, brand: productForm.brand, model: productForm.model, description: productForm.description,
        specifications: textToSpecs(productForm.specsText), price: productForm.price.trim() ? Number(productForm.price) : null,
        currency: productForm.currency, isFeatured: productForm.isFeatured,
        inventory: productForm.inventory.map((entry) => ({
          branchCode: entry.branchCode,
          availabilityStatus: entry.availabilityStatus,
          ...(entry.quantity.trim() ? { quantity: Number(entry.quantity) } : {}),
        })),
      };
      const saved = productForm.id
        ? await request<Product>(`/api/admin/products/${productForm.id}`, { method: 'PUT', body: jsonBody(payload) })
        : await request<Product>('/api/admin/products', { method: 'POST', body: jsonBody(payload) });
      setProductForm((current) => current ? { ...current, id: saved.id, productCode: saved.productCode } : current);
      if (productFiles.length) {
        const form = new FormData();
        productFiles.forEach((file) => form.append('images', file));
        const uploaded = await request<{ images: ProductImage[] }>(`/api/admin/products/${saved.id}/images`, { method: 'POST', body: form });
        setProductForm((current) => current ? { ...current, images: [...current.images, ...uploaded.images] } : current);
        setProductFiles([]);
      }
      if (publish && saved.status !== 'published') await request(`/api/admin/products/${saved.id}/status`, { method: 'PUT', body: jsonBody({ status: 'published' }) });
      setProductForm(null);
      setProductFiles([]);
      notify('success', publish ? 'تم حفظ الهاتف ونشره في الموقع.' : 'تم حفظ بيانات الهاتف بنجاح.');
      reload();
    } catch (reason) {
      notify('error', reason instanceof Error ? reason.message : 'تعذر حفظ الهاتف.');
    } finally { setSaving(false); }
  };

  const changeProductStatus = async (product: Product, status: string) => {
    const action = status === 'archived' ? 'أرشفة' : status === 'hidden' ? 'إخفاء' : status === 'draft' ? 'استعادة كمسودة' : 'نشر';
    if (!window.confirm(`هل تريد ${action} «${product.name}»؟`)) return;
    try {
      await request(`/api/admin/products/${product.id}/status`, { method: 'PUT', body: jsonBody({ status }) });
      notify('success', `تم ${action} المنتج بنجاح.`);
      reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : `تعذر ${action} المنتج.`); }
  };

  const saveStock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stockForm) return;
    setSaving(true);
    try {
      for (const item of stockForm.inventory) {
        await request(`/api/admin/products/${stockForm.product.id}/inventory`, {
          method: 'PUT',
          body: jsonBody({ branchCode: item.branchCode, availabilityStatus: item.availabilityStatus, ...(item.quantity.trim() ? { quantity: Number(item.quantity) } : {}) }),
        });
      }
      setStockForm(null);
      notify('success', 'تم تحديث توفر الهاتف وكميته في الفروع.');
      reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر تحديث المخزون.'); }
    finally { setSaving(false); }
  };

  const openStock = async (product: Product) => {
    let branchList = branches;
    if (!branchList.length) {
      try { branchList = await request<Branch[]>('/api/admin/branches'); setBranches(branchList); }
      catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر تحميل الفروع.'); return; }
    }
    const current = new Map(product.inventory.map((entry) => [entry.branchCode, entry]));
    setStockForm({ product, inventory: branchList.map((branch) => {
      const entry = current.get(branch.branchCode);
      return { branchCode: branch.branchCode, availabilityStatus: entry?.availabilityStatus || 'ask_to_confirm', quantity: entry?.quantity == null ? '' : String(entry.quantity) };
    }) });
  };

  const openBranchForm = (branch?: Branch) => setBranchForm({
    id: branch?.id, branchCode: branch?.branchCode || '', name: branch?.name || '', address: branch?.address || '',
    whatsappLocalNumber: branch?.whatsappLocalNumber || (branch?.whatsappE164 ? `+${branch.whatsappE164}` : ''), whatsappCountryCode: branch?.whatsappCountryCode || settings.defaultCountryCode || '',
    phone: branch?.phone || '', email: branch?.email || '', contactInfo: branch?.contactInfo || '',
    channelLinksText: linksText(branch?.channelLinks), mapsUrl: branch?.mapsUrl || '', isActive: branch?.isActive ?? true,
  });

  const saveBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!branchForm) return;
    setSaving(true);
    try {
      const payload = { ...branchForm, channelLinks: parseLinks(branchForm.channelLinksText) };
      delete (payload as any).id;
      delete (payload as any).channelLinksText;
      if (branchForm.id) await request(`/api/admin/branches/${branchForm.branchCode}`, { method: 'PUT', body: jsonBody(payload) });
      else await request('/api/admin/branches', { method: 'POST', body: jsonBody(payload) });
      setBranchForm(null);
      notify('success', branchForm.id ? 'تم تحديث بيانات الفرع.' : 'تمت إضافة الفرع.');
      reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حفظ الفرع.'); }
    finally { setSaving(false); }
  };

  const deleteBranch = async (branch: Branch) => {
    if (!window.confirm(`حذف «${branch.name}»؟ لا يمكن حذف فرع لديه سجلات توفر، ويمكنك إيقافه بدلًا من ذلك.`)) return;
    try {
      await request(`/api/admin/branches/${branch.branchCode}`, { method: 'DELETE' });
      notify('success', 'تم حذف الفرع.'); reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حذف الفرع.'); }
  };

  const uploadSingleImage = async (file: File) => {
    const form = new FormData(); form.append('image', file);
    return request<{ id: string; url: string }>('/api/admin/uploads', { method: 'POST', body: form });
  };

  const saveOffer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!offerForm) return;
    setSaving(true);
    try {
      let imageUrl = offerForm.imageUrl;
      if (offerFile) {
        imageUrl = (await uploadSingleImage(offerFile)).url;
        setOfferForm((current) => current ? { ...current, imageUrl } : current);
        setOfferFile(null);
      }
      const payload = { ...offerForm, imageUrl, startsAt: offerForm.startsAt || null, endsAt: offerForm.endsAt || null };
      delete (payload as any).id;
      if (offerForm.id) await request(`/api/admin/offers/${offerForm.id}`, { method: 'PUT', body: jsonBody(payload) });
      else await request('/api/admin/offers', { method: 'POST', body: jsonBody(payload) });
      setOfferForm(null); setOfferFile(null);
      notify('success', offerForm.id ? 'تم تحديث العرض.' : 'تمت إضافة العرض.'); reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حفظ العرض.'); }
    finally { setSaving(false); }
  };

  const deleteOffer = async (offer: Offer) => {
    if (!window.confirm(`حذف العرض «${offer.title}»؟`)) return;
    try { await request(`/api/admin/offers/${offer.id}`, { method: 'DELETE' }); notify('success', 'تم حذف العرض.'); reload(); }
    catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حذف العرض.'); }
  };

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = { ...settings };
      if (settingsFile) {
        updated.heroImageUrl = (await uploadSingleImage(settingsFile)).url;
        setSettings(updated);
        setSettingsFile(null);
      }
      await request('/api/admin/settings', { method: 'PUT', body: jsonBody({ ...updated, channelLinks: updated.channelLinks }) });
      setSettings(updated); setSettingsFile(null);
      notify('success', 'تم حفظ إعدادات المتجر.'); reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حفظ الإعدادات.'); }
    finally { setSaving(false); }
  };

  const saveAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teamForm) return;
    setSaving(true);
    try {
      if (teamForm.id) {
        const payload: Record<string, unknown> = { displayName: teamForm.displayName, role: teamForm.role, isActive: teamForm.isActive };
        if (teamForm.password) payload.password = teamForm.password;
        await request(`/api/admin/admins/${teamForm.id}`, { method: 'PUT', body: jsonBody(payload) });
      } else {
        await request('/api/admin/admins', { method: 'POST', body: jsonBody({ username: teamForm.username, displayName: teamForm.displayName, role: teamForm.role, password: teamForm.password }) });
      }
      setTeamForm(null); notify('success', 'تم حفظ حساب الإدارة.'); reload();
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حفظ حساب الإدارة.'); }
    finally { setSaving(false); }
  };

  const deactivateAdmin = async (admin: AdminUser) => {
    if (!window.confirm(`تعطيل حساب ${admin.displayName}؟`)) return;
    try { await request(`/api/admin/admins/${admin.id}`, { method: 'DELETE' }); notify('success', 'تم تعطيل الحساب وإلغاء جلساته.'); reload(); }
    catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر تعطيل الحساب.'); }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordForm) return;
    setSaving(true);
    try {
      await request('/api/admin/account/password', { method: 'PUT', body: jsonBody(passwordForm) });
      await logout();
      setPasswordForm(null);
      notify('success', 'تم تغيير كلمة المرور؛ سجّل الدخول مرة أخرى.');
    } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر تغيير كلمة المرور.'); }
    finally { setSaving(false); }
  };

  if (authLoading) return <div className="admin-loading-screen"><LoaderCircle className="spin" size={28} /><span>جارٍ التحقق من الجلسة الآمنة...</span></div>;
  if (!user) return (
    <div className="admin-login-page" dir="rtl">
      <div className="login-decoration decoration-one" /><div className="login-decoration decoration-two" />
      <div className="admin-login-card">
        <Link href="/" className="login-brand"><BrandLogo className="login-brand-logo" /><span><b>الوسوف</b><small>نظام إدارة المتجر</small></span></Link>
        <div className="login-heading"><span className="admin-kicker"><ShieldCheck size={15} /> مساحة إدارية آمنة</span><h1>مرحبًا بعودتك</h1><p>سجّل الدخول لإدارة الكتالوج والفروع وإعدادات المتجر.</p></div>
        {(loginError || error) && <div className="admin-alert error"><CircleAlert size={17} /><span>{loginError || error}</span></div>}
        <form className="admin-form login-form" onSubmit={login}>
          <label>اسم المستخدم<input autoComplete="username" value={loginName} onChange={(event) => setLoginName(event.target.value)} required maxLength={40} placeholder="مثال: storeadmin" /></label>
          <label>كلمة المرور<span className="password-input"><input autoComplete="current-password" type={showLoginPassword ? 'text' : 'password'} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required maxLength={128} /><button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} aria-label={showLoginPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showLoginPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          <button className="admin-button primary full-width" type="submit" disabled={loginLoading}>{loginLoading ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} تسجيل الدخول الآمن</button>
        </form>
        <div className="login-security"><ShieldCheck size={15} /><span>اتصال مشفّر · صلاحيات مخصصة لكل حساب</span></div>
        <Link href="/" className="login-back"><ArrowLeft size={15} /> العودة إلى الموقع</Link>
      </div>
    </div>
  );

  const currentSection = sections.find((item) => item.id === section) || sections[0];

  return (
    <div className="admin-app" dir="rtl">
      <header className="admin-topbar">
        <div className="admin-topbar-start">
          <button className="admin-menu-toggle" onClick={() => setMobileMenu((value) => !value)} aria-label="فتح القائمة"><Menu size={20} /></button>
          <Link href="/" className="dashboard-brand"><BrandLogo className="dashboard-brand-logo" /><span><b>الوسوف</b><small>لوحة التحكم</small></span></Link>
          <span className="admin-topbar-divider" />
          <span className="admin-topbar-title">إدارة المتجر</span>
        </div>
        <div className="admin-topbar-end">
          <a className="view-store-link" href="/" target="_blank" rel="noreferrer"><Eye size={15} /> معاينة الموقع</a>
          <div className="admin-user-menu"><span className="admin-avatar"><UserRound size={18} /></span><span className="admin-user-copy"><b>{user.displayName}</b><small>{roleNames[user.role]}</small></span><button className="user-menu-chevron" onClick={() => setPasswordForm({ currentPassword: '', newPassword: '' })} aria-label="تغيير كلمة المرور"><ChevronDown size={16} /></button></div>
          <button className="logout-button" onClick={() => void logout()} title="تسجيل الخروج" aria-label="تسجيل الخروج"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="admin-layout">
        {mobileMenu && <button className="admin-sidebar-backdrop" onClick={() => setMobileMenu(false)} aria-label="إغلاق القائمة" />}
        <aside className={mobileMenu ? 'admin-sidebar open' : 'admin-sidebar'}>
          <div className="sidebar-label">القائمة الرئيسية</div>
          <nav aria-label="أقسام لوحة التحكم">
            {sections.map(({ id, title, Icon }) => <button key={id} onClick={() => { setSection(id); setMobileMenu(false); }} className={section === id ? 'admin-nav-item active' : 'admin-nav-item'}><Icon size={18} /><span>{title}</span>{section === id && <span className="nav-current-dot" />}</button>)}
          </nav>
          <div className="sidebar-support"><span className="support-orbit"><MessageCircle size={19} /></span><b>إدارة أسهل، خدمة أفضل</b><p>كل أدوات متجرك في مكان واحد.</p><a href="/branches">معلومات التواصل <ArrowLeft size={13} /></a></div>
          <div className="sidebar-footer"><span className="sidebar-live-dot" /> النظام متصل <small>Al-Wassouf Dashboard</small></div>
        </aside>

        <main className="admin-main">
          <div className="admin-page-heading"><div><span className="admin-page-eyebrow">إدارة الوسوف <span>/</span> {currentSection?.title}</span><h1>{currentSection?.title || 'لوحة التحكم'}</h1><p>{sectionDescription(section)}</p></div>{section === 'products' && can('product:create') && <button className="admin-button primary" onClick={() => void openProductForm()}><Plus size={17} /> إضافة هاتف</button>}{section === 'branches' && can('branch:edit') && <button className="admin-button primary" onClick={() => openBranchForm()}><Plus size={17} /> إضافة فرع</button>}{section === 'offers' && can('offers:edit') && <button className="admin-button primary" onClick={() => { setOfferFile(null); setOfferForm({ title: '', description: '', imageUrl: '', ctaLabel: '', ctaUrl: '', isActive: false, startsAt: '', endsAt: '' }); }}><Plus size={17} /> إضافة عرض</button>}{section === 'admins' && can('admins:manage') && <button className="admin-button primary" onClick={() => setTeamForm({ username: '', displayName: '', role: 'editor', isActive: true, password: '' })}><Plus size={17} /> إضافة مسؤول</button>}</div>
          {notice && <div className={`admin-toast ${notice.kind}`} role="status"><span>{notice.kind === 'success' ? <Check size={17} /> : notice.kind === 'error' ? <CircleAlert size={17} /> : <ShieldCheck size={17} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="إغلاق"><X size={16} /></button></div>}
          {error && <div className="admin-alert error page-error"><CircleAlert size={17} /><span>{error}</span><button onClick={reload}>إعادة المحاولة</button></div>}
          {sectionLoading && <div className="section-loading"><LoaderCircle className="spin" size={19} /> جارٍ تحميل البيانات...</div>}

          {section === 'overview' && <OverviewSection stats={stats} onNavigate={setSection} />}
          {section === 'products' && <ProductsSection products={products} can={can} query={productQuery} setQuery={setProductQuery} status={productStatus} setStatus={setProductStatus} onEdit={(product) => void openProductForm(product)} onStatus={changeProductStatus} onStock={(product) => void openStock(product)} />}
          {section === 'branches' && <BranchesSection branches={branches} can={can} onEdit={openBranchForm} onDelete={deleteBranch} />}
          {section === 'offers' && <OffersSection offers={offers} onEdit={(offer) => { setOfferFile(null); setOfferForm({ id: offer.id, title: offer.title, description: offer.description, imageUrl: offer.imageUrl, ctaLabel: offer.ctaLabel, ctaUrl: offer.ctaUrl, isActive: offer.isActive, startsAt: offer.startsAt ? offer.startsAt.slice(0, 16) : '', endsAt: offer.endsAt ? offer.endsAt.slice(0, 16) : '' }); }} onDelete={deleteOffer} />}
          {section === 'settings' && <SettingsSection settings={settings} setSettings={setSettings} setFile={setSettingsFile} file={settingsFile} onSave={saveSettings} saving={saving} />}
          {section === 'admins' && <AdminsSection admins={admins} onEdit={(admin) => setTeamForm({ id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role, isActive: admin.isActive, password: '' })} onDeactivate={deactivateAdmin} currentUser={user} />}
          {section === 'activity' && <ActivitySection logs={auditLogs} />}
        </main>
      </div>

      {productForm && <Modal title={productForm.id ? `تعديل ${productForm.productCode}` : 'إضافة هاتف جديد'} onClose={() => { if (!saving) { setProductForm(null); setProductFiles([]); } }} size="wide"><form className="admin-form product-edit-form" onSubmit={(event) => void saveProduct(event, false)}>
        <div className="product-edit-fields">
          {productForm.productCode && <div className="product-code-pill"><Package size={15} /> رمز المنتج: <b>{productForm.productCode}</b></div>}
          {productForm.images.length > 0 && <div className="existing-images"><b>الصور الحالية</b><div className="image-thumb-list">{productForm.images.map((image) => <figure key={image.assetId}><img src={imagePreview(image.url)} alt={image.alt || productForm.name} /><button type="button" disabled={!can('product:edit')} onClick={async () => { try { await request(`/api/admin/products/${productForm.id}/images/${image.assetId}`, { method: 'DELETE' }); setProductForm((current) => current ? { ...current, images: current.images.filter((entry) => entry.assetId !== image.assetId) } : current); notify('success', 'تم حذف الصورة.'); } catch (reason) { notify('error', reason instanceof Error ? reason.message : 'تعذر حذف الصورة.'); } }} aria-label="حذف الصورة"><X size={14} /></button></figure>)}</div></div>}
          {(products.find((product) => product.id === productForm.id)?.legacyImagesCount || 0) > 0 && <div className="admin-hint"><CircleAlert size={15} /> توجد صور قديمة تحتاج إلى إعادة رفعها بصيغة محلية.</div>}
          <div className="form-grid two"><label>اسم الهاتف *<input autoFocus value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required maxLength={120} placeholder="مثال: Galaxy S25 Ultra" /></label><label>الماركة *<BrandPicker value={productForm.brand} onChange={(brand) => setProductForm({ ...productForm, brand })} required /></label><label>الموديل<input value={productForm.model} onChange={(event) => setProductForm({ ...productForm, model: event.target.value })} maxLength={160} placeholder="256GB · أسود" /></label><label>السعر الاختياري<input type="number" min="0" step="any" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} placeholder="اتركه فارغًا عند عدم تحديد السعر" /></label><label>العملة<input value={productForm.currency} onChange={(event) => setProductForm({ ...productForm, currency: event.target.value })} maxLength={8} /></label><label className="checkbox-row"><input type="checkbox" checked={productForm.isFeatured} onChange={(event) => setProductForm({ ...productForm, isFeatured: event.target.checked })} /> إظهار ضمن المنتجات المميزة</label></div>
          <label>وصف الهاتف<textarea rows={3} value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} maxLength={4000} placeholder="نبذة قصيرة عن الهاتف ومميزاته" /></label>
          <label>المواصفات <small>سطر لكل مواصفة: اسم الخاصية: القيمة</small><textarea rows={4} value={productForm.specsText} onChange={(event) => setProductForm({ ...productForm, specsText: event.target.value })} placeholder={'الشاشة: 6.8 بوصة\nالذاكرة: 12GB\nالتخزين: 256GB'} /></label>
          <div className="admin-field"><span>صور الهاتف <small>حتى 8 صور، 8 ميغابايت لكل صورة</small></span><label className="file-drop"><ImagePlus size={18} /><span>{productFiles.length ? `تم اختيار ${productFiles.length} صورة` : 'اختر صورًا من جهازك أو اسحبها هنا'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setProductFiles(Array.from(event.target.files || []).slice(0, 8))} /></label>{productFiles.length > 0 && <div className="selected-file-list">{productFiles.map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name} · {formatBytes(file.size)}</span>)}</div>}</div>
          <div className="inventory-editor"><div className="inventory-editor-heading"><div><b>التوفر حسب الفرع</b><small>سجل الهاتف مرة واحدة، ثم حدّد الكمية في كل فرع.</small></div><Building2 size={19} /></div>{productForm.inventory.length ? productForm.inventory.map((entry, index) => <div key={entry.branchCode} className="inventory-edit-row"><b>{branches.find((branch) => branch.branchCode === entry.branchCode)?.name || entry.branchCode}</b><select value={entry.availabilityStatus} onChange={(event) => setProductForm({ ...productForm, inventory: productForm.inventory.map((item, i) => i === index ? { ...item, availabilityStatus: event.target.value } : item) })}>{Object.entries(availabilityNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><input aria-label={`كمية ${entry.branchCode}`} type="number" min="0" step="1" value={entry.quantity} onChange={(event) => setProductForm({ ...productForm, inventory: productForm.inventory.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item) })} placeholder="الكمية" /></div>) : <div className="admin-empty-inline">أضف فرعًا أولًا حتى تتمكن من تسجيل توفر الهاتف.</div>}</div>
        </div>
        <aside className="product-live-preview"><span className="preview-eyebrow"><Eye size={14} /> معاينة قبل النشر</span><article className="product-card admin-preview-card"><div className="product-image">{previewUrls[0] || productForm.images[0]?.url ? <img src={previewUrls[0] || productForm.images[0]?.url} alt={productForm.name || 'معاينة الهاتف'} /> : <div className="device-placeholder"><span>📱</span><small>{productForm.brand || 'الماركة'}</small></div>}<span className="new-pill">معاينة</span></div><div className="product-content"><p className="eyebrow">{productForm.brand || 'الماركة'}</p><h3>{productForm.name || 'اسم الهاتف'}</h3><p className="product-model">{productForm.model || 'الموديل والمواصفات الأساسية'}</p><div className="stock-row">{productForm.inventory.slice(0, 2).map((entry) => <span key={entry.branchCode} className={entry.availabilityStatus === 'in_stock' ? 'stock-good' : 'stock-muted'}>{branches.find((branch) => branch.branchCode === entry.branchCode)?.name || entry.branchCode}: {availabilityNames[entry.availabilityStatus]}</span>)}</div><div className="product-bottom"><strong>{settings.showPrices && productForm.price ? `${Number(productForm.price).toLocaleString('ar')} ${productForm.currency}` : 'للاستفسار عن السعر'}</strong><span className="detail-link"><ArrowLeft size={17} /></span></div></div></article><div className="preview-note"><ShieldCheck size={15} /> لن يظهر الهاتف للزوار إلا بعد النشر.</div></aside>
        <div className="modal-actions"><button type="button" className="admin-button ghost" onClick={() => { if (!saving) { setProductForm(null); setProductFiles([]); } }}>إلغاء</button><button type="submit" className="admin-button secondary" disabled={saving}><Save size={16} /> {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button><button type="button" className="admin-button primary" disabled={saving} onClick={(event) => { const form = event.currentTarget.form; if (form?.reportValidity()) void saveProduct({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, true); }}><Eye size={16} /> {saving ? 'جارٍ النشر...' : 'حفظ ونشر'}</button></div>
      </form></Modal>}

      {stockForm && <Modal title={`إدارة التوفر · ${stockForm.product.name}`} onClose={() => !saving && setStockForm(null)}><form className="admin-form" onSubmit={(event) => void saveStock(event)}><p className="modal-intro">يظهر الهاتف مرة واحدة في الكتالوج، وتدار كميته وحالته لكل فرع بشكل مستقل.</p>{stockForm.inventory.map((entry, index) => <div className="stock-form-card" key={entry.branchCode}><div><MapPin size={16} /><b>{branches.find((branch) => branch.branchCode === entry.branchCode)?.name || entry.branchCode}</b></div><label>التوفر<select value={entry.availabilityStatus} onChange={(event) => setStockForm({ ...stockForm, inventory: stockForm.inventory.map((item, i) => i === index ? { ...item, availabilityStatus: event.target.value } : item) })}>{Object.entries(availabilityNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>الكمية<input type="number" min="0" step="1" value={entry.quantity} onChange={(event) => setStockForm({ ...stockForm, inventory: stockForm.inventory.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item) })} placeholder="غير محددة" /></label></div>)}<div className="modal-actions"><button type="button" className="admin-button ghost" onClick={() => setStockForm(null)}>إلغاء</button><button className="admin-button primary" disabled={saving}><Save size={16} /> حفظ التوفر</button></div></form></Modal>}

      {branchForm && <Modal title={branchForm.id ? 'تعديل بيانات الفرع' : 'إضافة فرع'} onClose={() => !saving && setBranchForm(null)}><form className="admin-form" onSubmit={(event) => void saveBranch(event)}><div className="form-grid two"><label>رمز الفرع *<input value={branchForm.branchCode} disabled={Boolean(branchForm.id)} onChange={(event) => setBranchForm({ ...branchForm, branchCode: event.target.value.toUpperCase() })} required maxLength={20} placeholder="BR-03" /></label><label>اسم الفرع *<input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} required maxLength={100} /></label></div><label>العنوان<textarea rows={2} value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} maxLength={300} /></label><div className="form-grid two"><label>رقم WhatsApp<input value={branchForm.whatsappLocalNumber} onChange={(event) => setBranchForm({ ...branchForm, whatsappLocalNumber: event.target.value })} placeholder="09xxxxxxxx أو +963..." /></label><label>رمز الدولة<input value={branchForm.whatsappCountryCode} onChange={(event) => setBranchForm({ ...branchForm, whatsappCountryCode: event.target.value })} placeholder="963" /></label><label>هاتف التواصل<input value={branchForm.phone} onChange={(event) => setBranchForm({ ...branchForm, phone: event.target.value })} /></label><label>البريد الإلكتروني<input type="email" value={branchForm.email} onChange={(event) => setBranchForm({ ...branchForm, email: event.target.value })} /></label></div><label>معلومات تواصل إضافية<textarea rows={2} value={branchForm.contactInfo} onChange={(event) => setBranchForm({ ...branchForm, contactInfo: event.target.value })} /></label><label>رابط الموقع على الخريطة<input type="url" value={branchForm.mapsUrl} onChange={(event) => setBranchForm({ ...branchForm, mapsUrl: event.target.value })} placeholder="https://maps.google.com/..." /></label><label>روابط القنوات <small>سطر لكل رابط بهذا الشكل: واتساب | https://...</small><textarea rows={3} value={branchForm.channelLinksText} onChange={(event) => setBranchForm({ ...branchForm, channelLinksText: event.target.value })} placeholder={'Instagram | https://instagram.com/...'} /></label><label className="checkbox-row"><input type="checkbox" checked={branchForm.isActive} onChange={(event) => setBranchForm({ ...branchForm, isActive: event.target.checked })} /> الفرع نشط ويظهر للزوار</label><div className="modal-actions"><button type="button" className="admin-button ghost" onClick={() => setBranchForm(null)}>إلغاء</button><button className="admin-button primary" disabled={saving}><Save size={16} /> حفظ الفرع</button></div></form></Modal>}

      {offerForm && <Modal title={offerForm.id ? 'تعديل العرض' : 'إضافة عرض جديد'} onClose={() => !saving && setOfferForm(null)}><form className="admin-form" onSubmit={(event) => void saveOffer(event)}><label>عنوان العرض *<input autoFocus value={offerForm.title} onChange={(event) => setOfferForm({ ...offerForm, title: event.target.value })} required maxLength={120} /></label><label>وصف العرض<textarea rows={3} value={offerForm.description} onChange={(event) => setOfferForm({ ...offerForm, description: event.target.value })} maxLength={1000} /></label><div className="form-grid two"><label>نص زر الإجراء<input value={offerForm.ctaLabel} onChange={(event) => setOfferForm({ ...offerForm, ctaLabel: event.target.value })} maxLength={50} placeholder="تواصل معنا" /></label><label>رابط الإجراء<input type="url" value={offerForm.ctaUrl} onChange={(event) => setOfferForm({ ...offerForm, ctaUrl: event.target.value })} placeholder="https://..." /></label><label>بداية العرض<input type="datetime-local" value={offerForm.startsAt} onChange={(event) => setOfferForm({ ...offerForm, startsAt: event.target.value })} /></label><label>نهاية العرض<input type="datetime-local" value={offerForm.endsAt} onChange={(event) => setOfferForm({ ...offerForm, endsAt: event.target.value })} /></label></div><div className="admin-field"><span>صورة العرض</span>{offerForm.imageUrl && <img className="offer-image-preview" src={offerForm.imageUrl} alt="معاينة العرض" />}<label className="file-drop"><ImagePlus size={18} /><span>{offerFile?.name || 'اختر صورة للعرض'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setOfferFile(event.target.files?.[0] || null)} /></label></div><label className="checkbox-row"><input type="checkbox" checked={offerForm.isActive} onChange={(event) => setOfferForm({ ...offerForm, isActive: event.target.checked })} /> تفعيل العرض على الموقع</label><div className="modal-actions"><button type="button" className="admin-button ghost" onClick={() => setOfferForm(null)}>إلغاء</button><button className="admin-button primary" disabled={saving}><Save size={16} /> حفظ العرض</button></div></form></Modal>}

      {teamForm && <Modal title={teamForm.id ? 'تعديل صلاحيات المسؤول' : 'إضافة مسؤول جديد'} onClose={() => !saving && setTeamForm(null)}><form className="admin-form" onSubmit={(event) => void saveAdmin(event)}><div className="form-grid two">{!teamForm.id && <label>اسم المستخدم *<input autoFocus autoComplete="off" value={teamForm.username} onChange={(event) => setTeamForm({ ...teamForm, username: event.target.value.toLowerCase() })} required minLength={3} maxLength={40} placeholder="store.editor" /></label>}<label>الاسم الظاهر *<input value={teamForm.displayName} onChange={(event) => setTeamForm({ ...teamForm, displayName: event.target.value })} required maxLength={80} /></label><label>الصلاحية<select value={teamForm.role} onChange={(event) => setTeamForm({ ...teamForm, role: event.target.value as AdminUser['role'] })}><option value="admin">مدير</option><option value="editor">محرر المنتجات</option><option value="inventory_manager">مسؤول المخزون</option><option value="owner">مالك المتجر</option></select></label><label>{teamForm.id ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور الأولية *'}<input type="password" autoComplete="new-password" value={teamForm.password} onChange={(event) => setTeamForm({ ...teamForm, password: event.target.value })} required={!teamForm.id} minLength={12} maxLength={128} placeholder="12 حرفًا على الأقل" /></label></div>{teamForm.id && <label className="checkbox-row"><input type="checkbox" checked={teamForm.isActive} onChange={(event) => setTeamForm({ ...teamForm, isActive: event.target.checked })} /> الحساب نشط</label>}<p className="admin-form-hint"><ShieldCheck size={15} /> يتم حفظ كلمات المرور بتجزئة آمنة، ولا يمكن عرضها بعد الحفظ.</p><div className="modal-actions"><button type="button" className="admin-button ghost" onClick={() => setTeamForm(null)}>إلغاء</button><button className="admin-button primary" disabled={saving}><Save size={16} /> حفظ الحساب</button></div></form></Modal>}

      {passwordForm && <Modal title="تغيير كلمة المرور" onClose={() => !saving && setPasswordForm(null)}><form className="admin-form" onSubmit={(event) => void savePassword(event)}><p className="modal-intro">استخدم كلمة مرور قوية لا تقل عن 12 حرفًا. سيتم إنهاء جلستك الحالية بعد التغيير.</p><label>كلمة المرور الحالية<input type="password" autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required /></label><label>كلمة المرور الجديدة<span className="password-input"><input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={12} maxLength={128} value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required /><button type="button" onClick={() => setShowNewPassword(!showNewPassword)}>{showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label><div className="modal-actions"><button type="button" className="admin-button ghost" onClick={() => setPasswordForm(null)}>إلغاء</button><button className="admin-button primary" disabled={saving}><ShieldCheck size={16} /> تغيير كلمة المرور</button></div></form></Modal>}
    </div>
  );
}

function sectionDescription(section: Section) {
  const descriptions: Record<Section, string> = {
    overview: 'ملخص حيّ لأداء المتجر والكتالوج والفروع.',
    products: 'أضف الهواتف وحدّث بياناتها وصورها وتوفرها في كل فرع.',
    branches: 'حدّث معلومات التواصل والفروع، وراجع حالة المخزون لكل موقع.',
    offers: 'أنشئ عروضًا مرئية على الموقع وحدّد مدة ظهورها وصورها.',
    settings: 'تحكم بهوية المتجر وسياسة الأسعار وقنوات التواصل.',
    admins: 'أدر حسابات الفريق والأدوار وألغِ الجلسات عند الحاجة.',
    activity: 'راجع العمليات التي نُفذت على لوحة التحكم.',
  };
  return descriptions[section];
}

function OverviewSection({ stats, onNavigate }: { stats: Stats | null; onNavigate: (section: Section) => void }) {
  if (!stats) return <EmptyState icon={<BarChart3 size={23} />} title="لا توجد إحصاءات بعد" text="ستظهر مؤشرات المتجر هنا بمجرد توفر البيانات." />;
  const metrics = [
    { label: 'منتجات منشورة', value: stats.publishedProducts, detail: 'متاحة للزوار', Icon: Package, tint: 'blue' },
    { label: 'الماركات', value: stats.brands, detail: 'في الكتالوج المنشور', Icon: Smartphone, tint: 'cyan' },
    { label: 'عمليات البحث اليوم', value: stats.searchesToday, detail: 'تفاعل الزوار مع الموقع', Icon: Search, tint: 'purple' },
    { label: 'نقرات WhatsApp اليوم', value: stats.whatsappClicksToday, detail: 'طلبات تواصل من الموقع', Icon: MessageCircle, tint: 'sky' },
  ];
  return <div className="overview-content"><div className="overview-welcome"><div><span>لوحتك جاهزة لإدارة المتجر</span><h2>مرحبًا بك في إدارة الوسوف</h2><p>أضف هاتفًا واحدًا للكتالوج، ثم وزّع توفره وكميته على الفروع.</p></div><div className="welcome-art"><div className="welcome-orb"><Smartphone size={38} /></div><span className="welcome-spark spark-one">✦</span><span className="welcome-spark spark-two">✦</span></div></div><div className="metrics-grid">{metrics.map(({ label, value, detail, Icon, tint }) => <article key={label} className="metric-card"><span className={`metric-icon ${tint}`}><Icon size={19} /></span><div><small>{label}</small><b>{value.toLocaleString('ar')}</b><span>{detail}</span></div><span className="metric-decoration" /></article>)}</div><div className="overview-lower"><section className="dashboard-panel"><div className="panel-heading"><div><span className="panel-eyebrow">الأكثر رواجًا</span><h3>عمليات البحث اليوم</h3></div><span className="panel-chip">اليوم</span></div>{stats.topSearches?.length ? <div className="search-stat-list">{stats.topSearches.map((item, index) => <div className="search-stat-row" key={`${item.term}-${index}`}><span className="search-rank">{String(index + 1).padStart(2, '0')}</span><b>{item.term}</b><span className="search-stat-count">{item.count} بحث</span></div>)}</div> : <div className="inline-empty"><Search size={22} /><span>لا توجد عمليات بحث مسجلة اليوم حتى الآن.</span></div>}</section><section className="dashboard-panel quick-actions"><div className="panel-heading"><div><span className="panel-eyebrow">اختصارات</span><h3>إدارة سريعة</h3></div><ArrowLeft size={17} /></div><button onClick={() => onNavigate('products')}><span className="quick-icon"><Plus size={17} /></span><span><b>إضافة هاتف</b><small>أضف منتجًا إلى الكتالوج</small></span><ArrowLeft size={15} /></button><button onClick={() => onNavigate('branches')}><span className="quick-icon aqua"><Building2 size={17} /></span><span><b>إدارة الفروع</b><small>{stats.activeBranches || 0} فرع نشط</small></span><ArrowLeft size={15} /></button><button onClick={() => onNavigate('offers')}><span className="quick-icon lilac"><BadgePercent size={17} /></span><span><b>العروض</b><small>{stats.activeOffers || 0} عرض مفعّل</small></span><ArrowLeft size={15} /></button></section></div><div className="dashboard-footnote"><ShieldCheck size={16} /><span>بيانات المخزون والسعر المنشورة تُعرض وفق إعدادات المتجر وسياسة الخصوصية المحددة.</span></div></div>;
}

function ProductsSection({ products, can, query, setQuery, status, setStatus, onEdit, onStatus, onStock }: {
  products: Product[]; can: (permission: string) => boolean; query: string; setQuery: (value: string) => void; status: string; setStatus: (value: string) => void;
  onEdit: (product: Product) => void; onStatus: (product: Product, status: string) => void; onStock: (product: Product) => void;
}) {
  return <section className="dashboard-panel products-panel"><div className="table-toolbar"><div className="table-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الماركة أو الرمز..." /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="تصفية المنتجات حسب الحالة"><option value="">جميع الحالات</option>{Object.entries(statusNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>{products.length ? <div className="responsive-table-wrap"><table className="admin-table"><thead><tr><th>المنتج</th><th>الحالة</th><th>توفر الفروع</th><th>السعر</th><th>آخر تحديث</th><th>الإجراءات</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="table-product"><span className="table-product-image">{product.images?.[0]?.url ? <img src={product.images[0].url} alt="" /> : <Smartphone size={19} />}</span><span><b>{product.name}</b><small>{product.brand} · {product.productCode}</small></span></div></td><td><span className={`status-badge ${product.status}`}>{statusNames[product.status] || product.status}</span></td><td><span className="branch-stock-summary">{product.inventory?.filter((item) => item.availabilityStatus === 'in_stock').length || 0} متوفر · {product.inventory?.length || 0} فروع</span></td><td>{product.price !== undefined ? `${Number(product.price).toLocaleString('ar')} ${product.currency}` : <span className="muted-cell">غير محدد</span>}</td><td>{formatDate(product.updatedAt)}</td><td><div className="table-actions">{can('product:edit') && <button onClick={() => onEdit(product)} title="تعديل الهاتف" aria-label="تعديل الهاتف"><Pencil size={15} /></button>}{can('inventory:edit') && <button onClick={() => onStock(product)} title="إدارة التوفر" aria-label="إدارة التوفر"><Building2 size={15} /></button>}{can('product:visibility') && product.status !== 'published' && product.status !== 'archived' && <button onClick={() => onStatus(product, 'published')} title="نشر" aria-label="نشر"><Eye size={15} /></button>}{can('product:visibility') && product.status === 'archived' && <button onClick={() => onStatus(product, 'draft')} title="استعادة كمسودة" aria-label="استعادة كمسودة"><Eye size={15} /></button>}{can('product:visibility') && product.status === 'published' && <button onClick={() => onStatus(product, 'hidden')} title="إخفاء" aria-label="إخفاء"><EyeOff size={15} /></button>}{can('product:archive') && product.status !== 'archived' && <button onClick={() => onStatus(product, 'archived')} title="أرشفة" aria-label="أرشفة"><Archive size={15} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={<Package size={23} />} title="لا توجد هواتف مطابقة" text="أضف هاتفًا جديدًا أو غيّر كلمات البحث والتصفية." />}</section>;
}

function BranchesSection({ branches, can, onEdit, onDelete }: { branches: Branch[]; can: (permission: string) => boolean; onEdit: (branch: Branch) => void; onDelete: (branch: Branch) => void }) {
  return <div className="branch-admin-grid">{branches.length ? branches.map((branch) => <article className="branch-admin-card" key={branch.id}><div className="branch-admin-card-top"><span className="branch-admin-icon"><MapPin size={19} /></span><span className={branch.isActive ? 'status-badge published' : 'status-badge archived'}>{branch.isActive ? 'نشط' : 'متوقف'}</span></div><span className="branch-code-label">{branch.branchCode}</span><h2>{branch.name}</h2><p className="branch-admin-address">{branch.address || 'لم تتم إضافة العنوان بعد.'}</p><div className="branch-contact-list">{branch.whatsappE164 && <span><MessageCircle size={14} /> +{branch.whatsappE164}</span>}{branch.phone && <span><Smartphone size={14} /> {branch.phone}</span>}{branch.email && <span><span className="contact-letter">@</span> {branch.email}</span>}{!branch.whatsappE164 && !branch.phone && !branch.email && <span className="muted-cell">لم تتم إضافة أرقام التواصل</span>}</div><div className="branch-admin-actions">{can('branch:edit') && <button className="admin-button secondary compact" onClick={() => onEdit(branch)}><Pencil size={14} /> تعديل</button>}{can('branch:edit') && <button className="admin-button ghost compact" onClick={() => onDelete(branch)}><Trash2 size={14} /> حذف</button>}</div></article>) : <EmptyState icon={<Building2 size={23} />} title="لا توجد فروع مسجلة" text="أضف الفروع التي تدير توفر الهواتف وقنوات التواصل فيها." />}</div>;
}

function OffersSection({ offers, onEdit, onDelete }: { offers: Offer[]; onEdit: (offer: Offer) => void; onDelete: (offer: Offer) => void }) {
  return offers.length ? <div className="offer-admin-grid">{offers.map((offer) => <article className="offer-admin-card" key={offer.id}><div className="offer-admin-image">{offer.imageUrl ? <img src={offer.imageUrl} alt={offer.title} /> : <span><BadgePercent size={30} /></span>}<span className={offer.isActive ? 'status-badge published offer-state' : 'status-badge draft offer-state'}>{offer.isActive ? 'مفعّل' : 'مسودة'}</span></div><div className="offer-admin-content"><h2>{offer.title}</h2><p>{offer.description || 'لا يوجد وصف مضاف لهذا العرض.'}</p><div className="offer-dates"><Clock3 size={14} /> {offer.startsAt || offer.endsAt ? `${formatDate(offer.startsAt)} — ${formatDate(offer.endsAt)}` : 'دون مدة محددة'}</div><div className="offer-admin-actions"><button className="admin-button secondary compact" onClick={() => onEdit(offer)}><Pencil size={14} /> تعديل</button><button className="admin-button ghost compact" onClick={() => onDelete(offer)}><Trash2 size={14} /> حذف</button></div></div></article>)}</div> : <EmptyState icon={<BadgePercent size={23} />} title="لا توجد عروض بعد" text="أنشئ عرضًا وحدّد صورته ومدة ظهوره ليظهر للزوار على الموقع." />;
}

function SettingsSection({ settings, setSettings, file, setFile, onSave, saving }: {
  settings: StoreSettings; setSettings: (value: StoreSettings) => void; file: File | null; setFile: (value: File | null) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void; saving: boolean;
}) {
  return <form className="settings-form dashboard-panel admin-form" onSubmit={onSave}><div className="settings-section-title"><span className="settings-section-icon"><Settings2 size={18} /></span><div><b>معلومات المتجر</b><small>الهوية والمعلومات التي يراها الزوار</small></div></div><div className="form-grid two"><label>اسم المتجر<input value={settings.storeName} onChange={(event) => setSettings({ ...settings, storeName: event.target.value })} required maxLength={100} /></label><label>العملة<input value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })} maxLength={8} placeholder="SYP" /></label></div><label>نبذة عن المتجر<textarea rows={4} value={settings.about} onChange={(event) => setSettings({ ...settings, about: event.target.value })} maxLength={3000} /></label><div className="settings-section-title"><span className="settings-section-icon aqua"><MessageCircle size={18} /></span><div><b>التواصل والقنوات</b><small>وسائل الاتصال وروابط حسابات المتجر</small></div></div><div className="form-grid two"><label>هاتف المتجر<input value={settings.contactPhone} onChange={(event) => setSettings({ ...settings, contactPhone: event.target.value })} maxLength={50} /></label><label>البريد الإلكتروني<input type="email" value={settings.contactEmail} onChange={(event) => setSettings({ ...settings, contactEmail: event.target.value })} maxLength={120} /></label><label>العنوان<input value={settings.contactAddress} onChange={(event) => setSettings({ ...settings, contactAddress: event.target.value })} maxLength={300} /></label><label>رمز الدولة الافتراضي<input value={settings.defaultCountryCode} onChange={(event) => setSettings({ ...settings, defaultCountryCode: event.target.value })} placeholder="963" maxLength={3} /></label></div><label>روابط القنوات <small>سطر لكل رابط: اسم القناة | https://...</small><textarea rows={4} value={linksText(settings.channelLinks)} onChange={(event) => setSettings({ ...settings, channelLinks: parseLinks(event.target.value) })} placeholder={'WhatsApp | https://whatsapp.com/channel/...\nInstagram | https://instagram.com/...'} /></label><div className="form-grid two"><label>رابط قناة WhatsApp<input type="url" value={settings.whatsappChannelUrl} onChange={(event) => setSettings({ ...settings, whatsappChannelUrl: event.target.value })} placeholder="https://whatsapp.com/channel/..." /></label><label className="checkbox-row"><input type="checkbox" checked={settings.whatsappChannelEnabled} onChange={(event) => setSettings({ ...settings, whatsappChannelEnabled: event.target.checked })} /> عرض رابط القناة في الموقع</label></div><div className="settings-section-title"><span className="settings-section-icon lilac"><ImagePlus size={18} /></span><div><b>صور الواجهة</b><small>صورة الغلاف المستخدمة في الصفحة الرئيسية</small></div></div><div className="settings-image-row">{settings.heroImageUrl && <img src={settings.heroImageUrl} alt="صورة واجهة المتجر" />}<label className="file-drop"><ImagePlus size={18} /><span>{file?.name || (settings.heroImageUrl ? 'استبدال صورة الواجهة' : 'رفع صورة الواجهة')}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div><div className="settings-section-title"><span className="settings-section-icon"><Eye size={18} /></span><div><b>سياسة عرض الكتالوج</b><small>تحكم بما يظهر للزوار في صفحات الهواتف</small></div></div><div className="settings-toggles"><label className="setting-toggle"><span><b>إظهار الأسعار</b><small>عرض سعر الهاتف عند توفره</small></span><input type="checkbox" checked={settings.showPrices} onChange={(event) => setSettings({ ...settings, showPrices: event.target.checked })} /></label><label className="setting-toggle"><span><b>إظهار كميات المخزون</b><small>الكمية الرقمية ظاهرة للزوار</small></span><input type="checkbox" checked={settings.showQuantities} onChange={(event) => setSettings({ ...settings, showQuantities: event.target.checked })} /></label></div><div className="settings-save-row"><span><ShieldCheck size={15} /> تُطبّق التغييرات على واجهة المتجر.</span><button className="admin-button primary" disabled={saving}><Save size={16} /> {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</button></div></form>;
}

function AdminsSection({ admins, onEdit, onDeactivate, currentUser }: { admins: AdminUser[]; onEdit: (admin: AdminUser) => void; onDeactivate: (admin: AdminUser) => void; currentUser: AdminUser }) {
  return <div className="dashboard-panel team-panel"><div className="team-intro"><span className="team-intro-icon"><ShieldCheck size={20} /></span><p>امنح كل عضو أقل صلاحية يحتاجها لإنجاز عمله. تعطيل الحساب يلغي جلساته النشطة فورًا.</p></div>{admins.length ? <div className="responsive-table-wrap"><table className="admin-table"><thead><tr><th>المسؤول</th><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{admins.map((admin) => <tr key={admin.id}><td><div className="team-person"><span><UserRound size={17} /></span><b>{admin.displayName}{admin.id === currentUser.id && <small>أنت</small>}</b></div></td><td dir="ltr" className="username-cell">{admin.username}</td><td>{roleNames[admin.role]}</td><td><span className={`status-badge ${admin.isActive ? 'published' : 'archived'}`}>{admin.isActive ? 'نشط' : 'معطل'}</span></td><td><div className="table-actions"><button onClick={() => onEdit(admin)} aria-label="تعديل الصلاحيات" title="تعديل الصلاحيات"><Pencil size={15} /></button>{admin.id !== currentUser.id && admin.isActive && <button className="danger-action" onClick={() => onDeactivate(admin)} aria-label="تعطيل الحساب" title="تعطيل الحساب"><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users size={23} />} title="لا يوجد مسؤولو إدارة" text="أضف حسابات آمنة لأعضاء الفريق وحدد الصلاحيات المناسبة." />}</div>;
}

function ActivitySection({ logs }: { logs: AuditEntry[] }) {
  const labels: Record<string, string> = {
    'product.create': 'أُضيف هاتف', 'product.update': 'عُدلت بيانات هاتف', 'product.delete': 'حُذف هاتف', 'product.status': 'تغيرت حالة هاتف',
    'product.images.upload': 'رُفعت صور هاتف', 'product.image.remove': 'حُذفت صورة هاتف', 'inventory.update': 'تحدّث توفر المخزون',
    'branch.create': 'أُضيف فرع', 'branch.update': 'عُدلت بيانات فرع', 'branch.delete': 'حُذف فرع', 'offer.create': 'أُضيف عرض', 'offer.update': 'عُدل عرض',
    'offer.delete': 'حُذف عرض', 'settings.update': 'تحدّثت الإعدادات', 'admin.create': 'أُضيف مسؤول', 'admin.update': 'عُدلت صلاحيات مسؤول',
    'admin.deactivate': 'عُطل حساب مسؤول', 'admin.password.change': 'تغيرت كلمة مرور', 'media.upload': 'رُفعت صورة', 'media.delete': 'حُذفت صورة',
  };
  return <section className="dashboard-panel activity-panel"><div className="panel-heading"><div><span className="panel-eyebrow">سجل التغييرات</span><h3>آخر العمليات الإدارية</h3></div><Activity size={18} /></div>{logs.length ? <div className="activity-list">{logs.map((log) => <article className="activity-item" key={log.id}><span className="activity-mark"><Activity size={16} /></span><div className="activity-copy"><b>{labels[log.action] || log.action}</b><span>{log.adminUsername || 'إدارة المتجر'}{log.targetId ? ` · ${log.targetId}` : ''}</span></div><time>{formatDate(log.createdAt)}</time></article>)}</div> : <EmptyState icon={<Activity size={23} />} title="سجل النشاط فارغ" text="ستظهر هنا العمليات التي ينفذها فريق الإدارة." />}</section>;
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="admin-empty-state"><span>{icon}</span><b>{title}</b><p>{text}</p></div>;
}

function Modal({ children, title, onClose, size = 'normal' }: { children: ReactNode; title: string; onClose: () => void; size?: 'normal' | 'wide' }) {
  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [onClose]);
  return <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`admin-modal ${size}`} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="modal-eyebrow">إدارة الوسوف</span><h2>{title}</h2></div><button className="modal-close" onClick={onClose} aria-label="إغلاق النافذة"><X size={19} /></button></header><div className="admin-modal-body">{children}</div></section></div>;
}
