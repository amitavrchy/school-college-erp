import type { NextConfig } from 'next';
const production = process.env.NODE_ENV === 'production';
// Next.js App Router injects inline bootstrap scripts, so script-src needs 'unsafe-inline' until a
// nonce-based policy is added; everything else is limited to this origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // School websites show tenant-supplied images (logos, galleries) that may be hosted elsewhere.
  "img-src 'self' data: blob: https:",
  // Socket.IO realtime refresh runs same-origin over /api/socket.io (HTTP polling + WebSocket).
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  // Online fee checkout redirects to the gateway's hosted page.
  "form-action 'self' https://sandbox.sslcommerz.com https://securepay.sslcommerz.com",
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(production
    ? // No includeSubDomains: school subdomains may not all have certificates yet.
      // Browsers ignore HSTS on plain-HTTP responses, so local production builds are unaffected.
      [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
    : []),
];
const config: NextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
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
