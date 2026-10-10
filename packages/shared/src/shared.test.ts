import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeWhatsAppNumber, buildWhatsAppUrl, searchKeywords, isValidWhatsAppChannelUrl, formatProductCode, isNewArrival, roleHasPermission } from './index';

describe('normalizeText', () => {
  it('normalizes arabic variants and digits', () => {
    expect(normalizeText('  أَيفون ١٥  Pro ')).toBe('ايفون 15 pro');
  });
});
describe('whatsapp', () => {
  it('refuses local numbers without country code', () => {
    expect(normalizeWhatsAppNumber('0984841468').ok).toBe(false);
  });
  it('converts local with country code', () => {
    expect(normalizeWhatsAppNumber('0984841468', '963')).toEqual({ ok: true, e164: '963984841468' });
  });
  it('accepts +international and 00', () => {
    expect(normalizeWhatsAppNumber('+963 984 841 468').e164).toBe('963984841468');
    expect(normalizeWhatsAppNumber('00963984841468').e164).toBe('963984841468');
  });
  it('rejects garbage', () => {
    expect(normalizeWhatsAppNumber('abc', '963').ok).toBe(false);
  });
  it('builds url with encoded text', () => {
    expect(buildWhatsAppUrl('963984841468', 'مرحبا')).toContain('https://wa.me/963984841468?text=%D9%85');
    expect(buildWhatsAppUrl(undefined)).toBeUndefined();
  });
});
describe('misc', () => {
  it('keywords include brand aliases', () => {
    expect(searchKeywords('Galaxy S24', 'Samsung')).toContain('سامسونج');
  });
  it('channel url', () => {
    expect(isValidWhatsAppChannelUrl('https://whatsapp.com/channel/abc')).toBe(true);
    expect(isValidWhatsAppChannelUrl('http://whatsapp.com/channel/abc')).toBe(false);
    expect(isValidWhatsAppChannelUrl('https://evil.com/x')).toBe(false);
  });
  it('code + new arrival + perms', () => {
    expect(formatProductCode(24)).toBe('WSF-000024');
    expect(isNewArrival(new Date())).toBe(true);
    expect(isNewArrival(new Date(Date.now() - 40 * 86400000))).toBe(false);
    expect(roleHasPermission('inventory_manager', 'product:create')).toBe(false);
  });
});
