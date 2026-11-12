import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/api/socket.io/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/api/socket.io/`,
      },
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/api/:path*`,
      },
    ];
  },
};
export default config;
