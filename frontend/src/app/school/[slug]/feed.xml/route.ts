import { loadPublicSchool } from '@/lib/school-site';
import { xml } from '@/lib/school-xml';
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params,
    site = await loadPublicSchool(slug);
  if (!site) return new Response('Not found', { status: 404 });
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>' +
      xml(site.content.name) +
      '</title><link>' +
      xml(site.origin) +
      '</link><description>' +
      xml(site.content.description) +
      '</description>' +
      site.content.posts
        .map(
          (p) =>
            '<item><title>' +
            xml(p.title) +
            '</title><link>' +
            xml(
              site.origin +
                '/' +
                { NEWS: 'news', NOTICE: 'notices', EVENT: 'events' }[p.category] +
                '/' +
                p.slug,
            ) +
            '</link><guid isPermaLink="false">' +
            xml(p.id) +
            '</guid><description>' +
            xml(p.body) +
            '</description><pubDate>' +
            new Date(p.publishAt).toUTCString() +
            '</pubDate></item>',
        )
        .join('') +
      '</channel></rss>',
    {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}
