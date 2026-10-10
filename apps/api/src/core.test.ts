import { describe, expect, it } from 'vitest';
import { normalizeText, normalizeWhatsAppNumber, roleHasPermission } from '@wassouf/shared';

describe('API domain rules', () => {
  it('normalizes Arabic search terms and digits', () => {
    expect(normalizeText('آيفون ١٥')).toBe('ايفون 15');
  });
  it('never guesses a country code for a local WhatsApp number', () => {
    expect(normalizeWhatsAppNumber('0984841468').ok).toBe(false);
    expect(normalizeWhatsAppNumber('0984841468', '963').e164).toBe('963984841468');
  });
  it('keeps inventory managers from changing settings', () => {
    expect(roleHasPermission('inventory_manager', 'inventory:edit')).toBe(true);
    expect(roleHasPermission('inventory_manager', 'settings:edit')).toBe(false);
  });
});
