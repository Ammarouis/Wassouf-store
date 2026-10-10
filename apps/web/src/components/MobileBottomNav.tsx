'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Grid2X2, MapPin } from 'lucide-react';

export function MobileBottomNav() {
  const pathname = usePathname();
  const items = [
    { href: '/', label: 'الرئيسية', Icon: Home },
    { href: '/search', label: 'البحث', Icon: Search },
    { href: '/brands', label: 'الماركات', Icon: Grid2X2 },
    { href: '/branches', label: 'الفروع', Icon: MapPin },
  ];
  return (
    <nav className="mobile-bottom-nav" aria-label="شريط التنقل السفلي">
      {items.map(({ href, label, Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return <Link key={href} href={href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}><Icon size={19} /><span>{label}</span></Link>;
      })}
    </nav>
  );
}
