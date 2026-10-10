'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, Store, Smartphone, MapPin, Grid2X2, ArrowLeft } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export function Header({ storeName = 'الوسوف للاتصالات' }: { storeName?: string }) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    router.push(searchQuery.trim() ? `/search?q=${encodeURIComponent(searchQuery.trim())}` : '/search');
  };
  const navItems = [
    { href: '/', label: 'الرئيسية', Icon: Store },
    { href: '/search', label: 'الأجهزة', Icon: Smartphone },
    { href: '/brands', label: 'الماركات', Icon: Grid2X2 },
    { href: '/branches', label: 'الفروع', Icon: MapPin },
  ];

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="header-brand" aria-label="العودة إلى الرئيسية">
          <BrandLogo className="header-logo" priority />
          <span className="header-brand-copy"><b>{storeName}</b><small>عالم الهواتف الذكية</small></span>
        </Link>
        <form onSubmit={handleSearchSubmit} className="header-search" role="search">
          <Search size={17} aria-hidden="true" />
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="ابحث عن هاتف أو ماركة..." aria-label="البحث عن منتج" />
          <button type="submit" aria-label="تنفيذ البحث"><ArrowLeft size={17} /></button>
        </form>
        <nav className="header-nav" aria-label="التنقل الرئيسي">
          {navItems.map(({ href, label, Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return <Link key={href} href={href} className={active ? 'header-nav-link active' : 'header-nav-link'} aria-current={active ? 'page' : undefined}><Icon size={16} />{label}</Link>;
          })}
        </nav>
        <Link href="/search" className="header-mobile-search" aria-label="البحث"><Search size={20} /></Link>
      </div>
    </header>
  );
}
