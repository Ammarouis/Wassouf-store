import Link from 'next/link';
import type { PublicProduct } from '@wassouf/shared';
import { ArrowUpLeft, MessageCircle } from 'lucide-react';

export function ProductCard({ product, currency = 'ل.س' }: { product: PublicProduct; currency?: string }) {
  const whatsappUrl = product.availability.find((item) => item.whatsappUrl)?.whatsappUrl;
  return <article className="product-card">
    <Link href={`/product/${encodeURIComponent(product.productCode)}`} className="product-image" aria-label={`تفاصيل ${product.name}`}>
      {product.images?.[0]?.url ? <img src={product.images[0].url} alt={product.images[0].alt || product.name} loading="lazy" /> : <div className="device-placeholder"><span>📱</span><small>{product.brand}</small></div>}
      {product.isNew && <span className="new-pill">وصل حديثًا</span>}
    </Link>
    <div className="product-content"><p className="eyebrow">{product.brand}</p><Link href={`/product/${encodeURIComponent(product.productCode)}`}><h3>{product.name}</h3></Link>
      <p className="product-model">{product.model || 'هاتف ذكي'}</p>
      <div className="stock-row">{product.availability.slice(0, 2).map((availability) => <span key={availability.branchCode} className={availability.status === 'in_stock' ? 'stock-good' : 'stock-muted'}>{availability.branchName}: {availability.statusLabel}</span>)}</div>
      <div className="product-bottom">{product.price !== undefined ? <strong>{product.price.toLocaleString('ar')} {product.currency || currency}</strong> : <strong className="ask-price">للاستفسار عن السعر</strong>}
        {whatsappUrl ? <a className="wa-mini" href={whatsappUrl} target="_blank" rel="noreferrer" aria-label="استفسر عبر واتساب"><MessageCircle size={17} /></a> : <Link className="detail-link" href={`/product/${encodeURIComponent(product.productCode)}`} aria-label="تفاصيل الهاتف"><ArrowUpLeft size={18} /></Link>}</div>
    </div>
  </article>;
}
