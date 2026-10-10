import Link from 'next/link';
import { ArrowLeft, MapPin, MessageCircle } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { PublicBranch } from '@wassouf/shared';

interface FooterProps {
  storeName?: string;
  about?: string;
  whatsappChannelUrl?: string;
  branches?: PublicBranch[];
}

export function Footer({
  storeName = 'الوسوف للاتصالات',
  about = 'اكتشف أحدث الهواتف الذكية وتواصل مع فروع الوسوف بسهولة.',
  whatsappChannelUrl,
  branches = [],
}: FooterProps) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-brand-block">
            <Link href="/" className="footer-brand">
              <BrandLogo size={43} className="footer-logo" />
              <b>{storeName}</b>
            </Link>
            <p>{about}</p>
            {whatsappChannelUrl && <a className="footer-channel" href={whatsappChannelUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /> قناة الوسوف على واتساب</a>}
          </div>
          <div className="footer-column">
            <h3>روابط سريعة</h3>
            <Link href="/search">الأجهزة والبحث <ArrowLeft size={14} /></Link>
            <Link href="/brands">تصفّح الماركات <ArrowLeft size={14} /></Link>
            <Link href="/branches">الفروع والتواصل <ArrowLeft size={14} /></Link>
          </div>
          <div className="footer-column footer-branches">
            <h3>فروع المتجر</h3>
            {branches.length ? branches.slice(0, 3).map((branch) => <Link key={branch.branchCode} href="/branches"><MapPin size={14} /><span>{branch.name}<small>{branch.address}</small></span></Link>) : <p>تواصل معنا عبر صفحة الفروع لمعرفة العناوين ومعلومات التواصل.</p>}
          </div>
          <div className="footer-note">
            <span className="footer-note-icon"><MessageCircle size={19} /></span>
            <b>نحن هنا لمساعدتك</b>
            <p>استفسر عن توفر الأجهزة والأسعار مباشرةً من الفرع الأقرب إليك.</p>
            <Link href="/branches">معلومات التواصل <ArrowLeft size={14} /></Link>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} {storeName}. جميع الحقوق محفوظة.</p>
          <a className="footer-credit" href="https://cyriux.com" target="_blank" rel="noopener noreferrer">Designed by Cyriux</a>
        </div>
      </div>
    </footer>
  );
}
