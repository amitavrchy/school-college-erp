export interface SiteBlock {
  id: string;
  type: 'HERO' | 'TEXT' | 'FEATURES' | 'IMAGE' | 'CTA';
  title: string;
  body: string;
  imageUrl: string;
  imageAlt: string;
  link: string;
  linkLabel: string;
}
export interface SitePage {
  id: string;
  slug: string;
  title: string;
  description: string;
  inNavigation: boolean;
  blocks: SiteBlock[];
}
export interface SitePost {
  id: string;
  slug: string;
  category: 'NEWS' | 'NOTICE' | 'EVENT';
  title: string;
  body: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  eventDate: string | null;
  attachmentUrl: string;
}
export interface SiteContent {
  name: string;
  tagline: string;
  description: string;
  theme: 'ACADEMY' | 'MODERN' | 'CLASSIC';
  accent: string;
  logoUrl: string;
  heroUrl: string;
  email: string;
  phone: string;
  address: string;
  principalName: string;
  principalMessage: string;
  admissionsOpen: boolean;
  admissionsText: string;
  resultsEnabled: boolean;
  resultAccess: 'ROLL_DOB' | 'ROLL_ONLY';
  rollOnlyConsent: boolean;
  pages: SitePage[];
  posts: SitePost[];
  gallery: { url: string; caption: string; alt: string }[];
  staff: { name: string; role: string; photoUrl: string }[];
  downloads: { title: string; url: string }[];
}
export interface PublicSchoolSite {
  subdomain: string;
  organizationSlug: string;
  content: SiteContent;
  preview: boolean;
  origin: string;
  appOrigin: string;
  revision: number;
  publishedAt: string | null;
}
export async function loadPublicSchool(
  slug: string,
  preview?: string,
): Promise<PublicSchoolSite | null> {
  const r = await fetch(
    `${process.env.API_INTERNAL_URL || 'http://localhost:4000'}/api/public-websites/${encodeURIComponent(slug)}${preview ? '?preview=' + encodeURIComponent(preview) : ''}`,
    { cache: 'no-store', signal: AbortSignal.timeout(10000) },
  );
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error('School website is temporarily unavailable');
  return r.json();
}
