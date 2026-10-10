import type { NextConfig } from 'next';
import dotenv from 'dotenv';
import path from 'node:path';

// Workspace scripts run from apps/web; also load the repository-root environment file.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const nextConfig: NextConfig = {
  transpilePackages: ['@wassouf/shared'],
  async rewrites() {
    const apiBase = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
