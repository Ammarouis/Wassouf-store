import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Search, ShieldCheck, MapPin, Smartphone } from 'lucide-react';
import { getLatestProducts, getBrands, getSettings, getBranches, getOffers } from '@/lib/api';
import { ProductCard } from '@/components/ProductCard';
import { PublicOffers } from '@/components/PublicOffers';

export default async function HomePage() {
  const [products, brands, settings, branches, offers] = await Promise.all([
    getLatestProducts(8), getBrands(), getSettings(), getBranches(), getOffers(),
  ]);
  return <div className="page-shell">
    <section className="hero">
      <div className="hero-copy">
        <span className="hero-kicker"><span className="live-dot" /> وجهتك للهواتف الذكية</span>
        <h1>هاتفك القادم<br /><em>يبدأ من هنا.</em></h1>
        <p>تعرّف على أحدث الأجهزة، قارن الخيارات، وتحقق من التوفر في فروع الوسوف بكل سهولة.</p>
        <div className="hero-actions"><Link href="/search" className="button button-primary">اكتشف الهواتف <ArrowLeft size={18} /></Link><Link href="/search" className="button button-glass"><Search size={18} /> ابحث عن جهازك</Link></div>
        <div className="hero-trust"><span><ShieldCheck size={16} /> معلومات واضحة عن التوفر</span><span><MapPin size={16} /> {branches.length} فروع للتواصل</span></div>
      </div>
      <div className="hero-visual"><div className="hero-glow" /><Image src={settings.heroImageUrl || '/brand/storefront.png'} alt="متجر الوسوف" width={700} height={600} priority className="storefront-image" unoptimized={Boolean(settings.heroImageUrl)} /><div className="hero-float-card"><span className="float-icon"><Smartphone size={20} /></span><div><b>أحدث الأجهزة</b><small>تصفّح المتوفر الآن</small></div><ArrowLeft size={18} /></div></div>
      <div className="hero-index">01 <span /> 03</div>
    </section>
    <section className="benefit-strip"><div><span>01</span><b>اكتشف الخيارات</b><small>مجموعة من الماركات المعروفة</small></div><div><span>02</span><b>تحقق من التوفر</b><small>حسب كل فرع من فروعنا</small></div><div><span>03</span><b>تواصل مباشرة</b><small>استفسر عبر واتساب</small></div></section>
    <PublicOffers offers={offers} />
    <section className="section-block"><div className="section-heading"><div><span className="section-eyebrow">اختيارات الوسوف</span><h2>أحدث الهواتف</h2><p>تعرّف على أحدث الأجهزة المضافة إلى المتجر.</p></div><Link href="/search" className="text-link">عرض جميع الأجهزة <ArrowLeft size={17} /></Link></div>{products.length ? <div className="product-grid">{products.map((product) => <ProductCard key={product.productCode} product={product} currency={settings.currency} />)}</div> : <div className="empty-state"><span>📱</span><h3>الأجهزة الجديدة في الطريق</h3><p>سيتم عرض المنتجات هنا بمجرد إضافتها من إدارة المتجر.</p></div>}</section>
    <section className="section-block brand-section"><div className="section-heading"><div><span className="section-eyebrow">اعثر على ما تفضّل</span><h2>تصفّح حسب الماركة</h2><p>ابدأ البحث من العلامة التجارية التي تفضلها.</p></div><Link href="/brands" className="text-link">كل الماركات <ArrowLeft size={17} /></Link></div><div className="brand-list">{(brands.length ? brands : [{ name: 'Apple', count: 0 }, { name: 'Samsung', count: 0 }, { name: 'Xiaomi', count: 0 }, { name: 'Huawei', count: 0 }]).slice(0, 8).map((brand) => <Link key={brand.name} href={`/search?brand=${encodeURIComponent(brand.name)}`} className="brand-tile"><span className="brand-symbol">{brand.name === 'Apple' ? '◉' : brand.name === 'Samsung' ? 'S' : brand.name === 'Xiaomi' ? 'mi' : brand.name.slice(0, 1)}</span><b>{brand.name}</b><small>{brand.count} جهاز</small><ArrowLeft size={15} /></Link>)}</div></section>
    <section className="contact-banner"><div><span className="section-eyebrow">نحن هنا لمساعدتك</span><h2>لم تجد ما تبحث عنه؟</h2><p>تواصل مع أحد فروع الوسوف واسأل عن الجهاز الذي تريده.</p></div><Link href="/branches" className="button button-primary">تواصل مع الفروع <ArrowLeft size={18} /></Link></section>
    <section className="about-strip"><div className="about-mark">و</div><div><span className="section-eyebrow">عن الوسوف</span><h2>{settings.storeName}</h2><p>{settings.about}</p></div></section>
  </div>;
}
