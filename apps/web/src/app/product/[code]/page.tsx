import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, MapPin, MessageCircle } from 'lucide-react';
import { getProduct } from '@/lib/api';

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const product = await getProduct(code);
  return { title: product?.name || 'تفاصيل الهاتف', description: product?.description || `معلومات توفر ${product?.name || 'الهاتف'} في فروع الوسوف` };
}

export default async function ProductPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const product = await getProduct(code);
  if (!product) notFound();
  return <div className="page-shell inner-page"><Link href="/search" className="back-link"><ArrowRight size={17} /> العودة للأجهزة</Link><div className="detail-layout"><div className="detail-gallery"><div className="detail-image">{product.images?.[0]?.url ? <img src={product.images[0].url} alt={product.images[0].alt || product.name} /> : <div className="device-placeholder detail-placeholder"><span>📱</span><small>{product.brand}</small></div>}</div>{product.images.length > 1 && <div className="detail-thumbnails">{product.images.slice(1).map((image) => <img key={image.url} src={image.url} alt={image.alt || product.name} loading="lazy" />)}</div>}</div><div className="detail-info"><span className="section-eyebrow">{product.brand}</span><h1>{product.name}</h1><p className="detail-model">{product.model}</p>{product.description && <p className="detail-description">{product.description}</p>}{product.price !== undefined && <div className="detail-price">{product.price.toLocaleString('ar')} {product.currency}</div>}<h2>التوفر في الفروع</h2><div className="availability-list">{product.availability.map((availability) => <div key={availability.branchCode} className="availability-item"><div><b><MapPin size={16} />{availability.branchName}</b><small>{availability.statusLabel}{availability.quantity !== undefined ? ` · ${availability.quantity} قطعة` : ''}</small></div>{availability.whatsappUrl && <a href={availability.whatsappUrl} target="_blank" rel="noreferrer" className="button button-primary"><MessageCircle size={16} /> استفسر عن الجهاز</a>}</div>)}</div>{Object.keys(product.specifications || {}).length > 0 && <><h2>المواصفات</h2><dl className="spec-grid">{Object.entries(product.specifications).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></>}</div></div></div>;
}
