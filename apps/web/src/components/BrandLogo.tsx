import Image from 'next/image';

interface BrandLogoProps {
  /** Rendered pixel size of the square tile. */
  size?: number;
  className?: string;
  /** Renders at high priority so the header logo is not lazy-loaded. */
  priority?: boolean;
  alt?: string;
}

/**
 * The brand mark sits on a deep navy -> brand blue gradient tile.
 *
 * The source artwork (`/brand/logo.png`) is white/chrome calligraphy on an
 * opaque white background, so it disappears against a light surface. The
 * gradient tile gives the white lettering the contrast it needs to stay
 * legible down to the smallest header size, and `logo-mark.png` is the same
 * artwork with the white background knocked out to transparency.
 */
export function BrandLogo({ size = 44, className = '', priority = false, alt = 'شعار الوسوف' }: BrandLogoProps) {
  const mark = Math.round(size * 0.9);
  return (
    <span
      className={`brand-logo-tile${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Image src="/brand/logo-mark.png" alt={alt} width={mark} height={mark} priority={priority} />
    </span>
  );
}