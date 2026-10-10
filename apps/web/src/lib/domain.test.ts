import { describe, expect, it } from 'vitest';
import { normalizeText, searchKeywords } from '@wassouf/shared';

describe('store search helpers', () => {
  it('matches Arabic and Latin brand aliases', () => {
    expect(searchKeywords('سامسونج S24')).toContain('samsung');
    expect(normalizeText('  IPHONE   15 PRO ')).toBe('iphone 15 pro');
  });
});
