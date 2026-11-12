import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { loadPublicSchool } from '@/lib/school-site';
import SchoolWebsite from '@/components/school-website';
type Props = {
  params: Promise<{ slug: string; path?: string[] }>;
  searchParams: Promise<{ preview?: string }>;
};
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug, path = [] } = await params;
  const { preview } = await searchParams;
  const data = await loadPublicSchool(slug, preview);
  if (!data) return { title: 'School website not found', robots: { index: false } };
  const page = data.content.pages.find((p) => p.slug === (path[0] || 'home'));
  const label = page?.title || path[0] || 'Home';
  return {
    title: { absolute: `${label} | ${data.content.name}` },
    description: page?.description || data.content.description,
    alternates: { canonical: data.origin + '/' + path.join('/') },
    openGraph: {
      title: data.content.name,
      description: data.content.description,
      images: data.content.heroUrl ? [data.content.heroUrl] : [],
    },
    robots: { index: !preview && path[0] !== 'results', follow: !preview },
    referrer: 'no-referrer',
  };
}
export default async function SchoolPage({ params, searchParams }: Props) {
  const { slug, path = [] } = await params;
  const { preview } = await searchParams;
  const data = await loadPublicSchool(slug, preview);
  if (!data) notFound();
  const h = await headers();
  const base = h.get('x-school-site') === slug ? '' : `/school/${slug}`;
  const modulePaths = [
    'results',
    'contact',
    'admissions',
    'news',
    'notices',
    'events',
    'gallery',
    'faculty',
    'downloads',
  ];
  if (
    path.length > 2 ||
    (path.length === 2 && !['news', 'notices', 'events'].includes(path[0])) ||
    (path[0] &&
      !modulePaths.includes(path[0]) &&
      !data.content.pages.some((p) => p.slug === path[0]))
  )
    notFound();
  if (
    path.length === 2 &&
    !data.content.posts.some(
      (p) =>
        p.slug === path[1] &&
        p.category === { news: 'NEWS', notices: 'NOTICE', events: 'EVENT' }[path[0]],
    )
  )
    notFound();
  return <SchoolWebsite data={data} path={path} base={base} previewToken={preview} />;
}
