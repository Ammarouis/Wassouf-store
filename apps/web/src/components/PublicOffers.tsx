import type { PublicOffer } from '@wassouf/shared';
import { ArrowLeft, BadgePercent, Clock3 } from 'lucide-react';

export function PublicOffers({ offers }: { offers: PublicOffer[] }) {
  if (!offers.length) return null;
  return <section className="public-offers section-block"><div className="section-heading"><div><span className="section-eyebrow">لفترة محدودة</span><h2>عروض الوسوف</h2><p>تابع أحدث العروض والتخفيضات من فروعنا.</p></div><span className="offers-heading-icon"><BadgePercent size={23} /></span></div><div className="public-offers-grid">{offers.map((offer) => <article className="public-offer-card" key={offer.id}>{offer.imageUrl ? <img src={offer.imageUrl} alt={offer.title} loading="lazy" /> : <span className="public-offer-icon"><BadgePercent size={32} /></span>}<div className="public-offer-copy"><span><Clock3 size={13} /> عرض خاص</span><h3>{offer.title}</h3>{offer.description && <p>{offer.description}</p>}{offer.ctaUrl && <a href={offer.ctaUrl} target="_blank" rel="noopener noreferrer">{offer.ctaLabel || 'اكتشف العرض'} <ArrowLeft size={15} /></a>}</div></article>)}</div></section>;
}
