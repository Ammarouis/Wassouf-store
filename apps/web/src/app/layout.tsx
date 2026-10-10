import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { SiteFrame } from '@/components/SiteFrame';
import { getSiteUrl } from '@/lib/site';
export const metadata: Metadata = { title: {default:'الوسوف | عالم الهواتف الذكية', template:'%s | الوسوف'}, description:'اكتشف أحدث الهواتف الذكية وتحقق من توفرها في فروع متجر الوسوف.', metadataBase:getSiteUrl(), openGraph:{type:'website', locale:'ar_SY', siteName:'الوسوف'} };
export default function RootLayout({children}:{children:ReactNode}) { return <html lang="ar" dir="rtl"><body><SiteFrame>{children}</SiteFrame></body></html> }
