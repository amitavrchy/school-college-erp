import { NextRequest, NextResponse } from 'next/server';
export async function proxy(request: NextRequest) {
  const hostname = (request.headers.get('host') || '')
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  const appHost = new URL(process.env.APP_URL || 'http://localhost:3000').hostname;
  const headers = new Headers(request.headers);
  headers.delete('x-school-site');
  if (
    hostname === appHost ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  ) {
    return NextResponse.next({ request: { headers } });
  }
  const path = request.nextUrl.pathname;
  // School domains cannot host the ERP, auth cookies, account APIs or preview editor.
  if (path.startsWith('/api/')) {
    return path.startsWith('/api/public-websites/')
      ? NextResponse.next({ request: { headers } })
      : new NextResponse('Not found', { status: 404 });
  }
  if (
    path.startsWith('/_next/') ||
    path.startsWith('/images/') ||
    path === '/brand.svg' ||
    path === '/favicon.ico'
  )
    return NextResponse.next({ request: { headers } });
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/api/public-websites/resolve?host=${encodeURIComponent(hostname)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return new NextResponse('School website not found', { status: 404 });
    const { subdomain } = await response.json();
    if (!/^[a-z0-9-]+$/.test(subdomain) || path.startsWith('/school/'))
      return new NextResponse('Not found', { status: 404 });
    const url = request.nextUrl.clone();
    url.pathname = `/school/${subdomain}${path === '/' ? '' : path}`;
    headers.set('x-school-site', subdomain);
    return NextResponse.rewrite(url, { request: { headers } });
  } catch {
    return new NextResponse('School website temporarily unavailable', { status: 503 });
  }
}
