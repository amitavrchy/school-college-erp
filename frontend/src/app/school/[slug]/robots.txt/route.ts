import { loadPublicSchool } from '@/lib/school-site';
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    site = await loadPublicSchool(slug);
  if (!site) return new Response('User-agent: *\nDisallow: /', { status: 404 });
  return new Response(
    `User-agent: *\nAllow: /\nDisallow: /results\nDisallow: /school/${slug}/results\nDisallow: /api/\nDisallow: /*?preview=*\nSitemap: ${site.origin}/sitemap.xml\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}
