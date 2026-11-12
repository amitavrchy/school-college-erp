import { loadPublicSchool } from '@/lib/school-site';
import { xml } from '@/lib/school-xml';
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    site = await loadPublicSchool(slug);
  if (!site) return new Response('Not found', { status: 404 });
  const pages = site.content.pages.map((p) => (p.slug === 'home' ? '' : p.slug));
  const links = [
    ...pages,
    'admissions',
    'contact',
    'news',
    'notices',
    'events',
    'gallery',
    'faculty',
    'downloads',
    ...site.content.posts.map(
      (p) => ({ NEWS: 'news', NOTICE: 'notices', EVENT: 'events' })[p.category] + '/' + p.slug,
    ),
  ];
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      links.map((p) => '<url><loc>' + xml(site.origin + '/' + p) + '</loc></url>').join('') +
      '</urlset>',
    { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
