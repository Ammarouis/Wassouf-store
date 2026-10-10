import type { CatalogBrand } from '@/lib/brandCatalog';

interface BrandIconProps {
  brand: CatalogBrand;
  size?: number;
  className?: string;
}

/**
 * Renders a brand mark: the published SVG logo when we have one, otherwise a
 * coloured monogram tile. Brands we do not recognise at all fall back to the
 * first two letters of their name so the picker always shows something.
 */
export function BrandIcon({ brand, size = 22, className = '' }: BrandIconProps) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', className: `brand-icon${className ? ` ${className}` : ''}`, 'aria-hidden': true as const };

  if (brand.path) {
    return (
      <svg {...shared} style={{ color: brand.color }}>
        <path fill="currentColor" d={brand.path} />
      </svg>
    );
  }

  const letters = brand.mono || brand.name.slice(0, 2);
  return (
    <span
      className={`brand-icon brand-icon-mono${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, background: brand.color, color: brand.onColor, fontSize: Math.round(size * 0.44) }}
    >
      {letters}
    </span>
  );
}