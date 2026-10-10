import type { Metadata } from 'next';
import { AdminDashboard } from '@/components/AdminDashboard';

export const metadata: Metadata = { title: 'لوحة تحكم المتجر', robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminDashboard />;
}
