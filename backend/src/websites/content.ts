import { z } from 'zod';
const text = (max: number) => z.string().trim().max(max);
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .min(1)
  .max(60);
export const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    if (/^\/api\/public-websites\/media\/[a-z0-9]+$/.test(value)) return true;
    if (/^\/images\/school\/[a-z0-9-]+\.webp$/.test(value)) return true;
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      return false;
    }
  }, 'Use an HTTPS URL or an uploaded website asset');
const image = z.object({
  url: safeUrl.refine((v) => !!v, 'An image URL is required'),
  caption: text(200),
  alt: text(200).min(1),
});
export const blockSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['HERO', 'TEXT', 'FEATURES', 'IMAGE', 'CTA']),
  title: text(180),
  body: text(10000),
  imageUrl: safeUrl.default(''),
  imageAlt: text(200).default(''),
  link: z
    .union([safeUrl, z.literal('/admissions'), z.literal('/results'), z.literal('/contact')])
    .default(''),
  linkLabel: text(60).default(''),
});
export const contentSchema = z
  .object({
    name: text(120).min(3),
    tagline: text(200),
    description: text(320),
    theme: z.enum(['ACADEMY', 'MODERN', 'CLASSIC']),
    accent: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    logoUrl: safeUrl,
    heroUrl: safeUrl,
    email: z.union([z.email(), z.literal('')]),
    phone: text(40),
    address: text(400),
    principalName: text(120),
    principalMessage: text(5000),
    admissionsOpen: z.boolean(),
    admissionsText: text(5000),
    resultsEnabled: z.boolean(),
    resultAccess: z.enum(['ROLL_DOB', 'ROLL_ONLY']),
    rollOnlyConsent: z.boolean(),
    pages: z
      .array(
        z.object({
          id: z.string().uuid(),
          slug,
          title: text(100).min(1),
          description: text(320),
          inNavigation: z.boolean(),
          blocks: z.array(blockSchema).max(30),
        }),
      )
      .min(1)
      .max(20),
    posts: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            slug,
            category: z.enum(['NEWS', 'NOTICE', 'EVENT']),
            title: text(180).min(1),
            body: text(15000),
            pinned: z.boolean(),
            publishAt: z.iso.datetime(),
            expiresAt: z.iso.datetime().nullable(),
            eventDate: z.iso.datetime().nullable(),
            attachmentUrl: safeUrl,
          })
          .refine(
            (p) => !p.expiresAt || p.expiresAt > p.publishAt,
            'Expiry must follow publication',
          ),
      )
      .max(100),
    gallery: z.array(image).max(60),
    staff: z
      .array(z.object({ name: text(120).min(1), role: text(120), photoUrl: safeUrl }))
      .max(100),
    downloads: z
      .array(
        z.object({
          title: text(180).min(1),
          url: safeUrl.refine((v) => !!v, 'A document URL is required'),
        }),
      )
      .max(60),
  })
  .superRefine((v, ctx) => {
    if (v.resultAccess === 'ROLL_ONLY' && !v.rollOnlyConsent)
      ctx.addIssue({
        code: 'custom',
        message: 'Confirm consent before exposing results by roll number alone',
        path: ['rollOnlyConsent'],
      });
    if (!v.pages.some((p) => p.slug === 'home'))
      ctx.addIssue({ code: 'custom', message: 'A home page is required', path: ['pages'] });
    for (const [key, items] of [
      ['pages', v.pages],
      ['posts', v.posts],
    ] as const) {
      if (
        new Set(items.map((p) => p.slug)).size !== items.length ||
        new Set(items.map((p) => p.id)).size !== items.length
      )
        ctx.addIssue({
          code: 'custom',
          message: 'Page/post IDs and slugs must be unique',
          path: [key],
        });
    }
    const reserved = [
      'results',
      'contact',
      'admissions',
      'news',
      'notices',
      'events',
      'gallery',
      'faculty',
      'downloads',
      'sitemap.xml',
      'robots.txt',
    ];
    if (v.pages.some((p) => reserved.includes(p.slug)))
      ctx.addIssue({
        code: 'custom',
        message: 'This page URL is reserved for a school module',
        path: ['pages'],
      });
    for (const p of v.pages)
      for (const b of p.blocks)
        if (b.imageUrl && !b.imageAlt)
          ctx.addIssue({
            code: 'custom',
            message: 'Images need alternative text',
            path: ['pages'],
          });
  });
export type WebsiteContent = z.infer<typeof contentSchema>;
export function defaultContent(name: string): WebsiteContent {
  return {
    name,
    tagline: 'Learning today. Leading tomorrow.',
    description: `The official website of ${name}.`,
    theme: 'ACADEMY',
    accent: '#172b46',
    logoUrl: '',
    heroUrl: '',
    email: '',
    phone: '',
    address: '',
    principalName: '',
    principalMessage: '',
    admissionsOpen: false,
    admissionsText: 'Contact the admissions office for entry requirements and available places.',
    resultsEnabled: false,
    resultAccess: 'ROLL_DOB',
    rollOnlyConsent: false,
    pages: [
      {
        id: crypto.randomUUID(),
        slug: 'home',
        title: 'Home',
        description: '',
        inNavigation: true,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: 'HERO',
            title: `Welcome to ${name}`,
            body: 'Discover our school, meet our community and find the information your family needs.',
            imageUrl: '',
            imageAlt: '',
            link: '/admissions',
            linkLabel: 'Admissions information',
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        slug: 'about',
        title: 'About our school',
        description: '',
        inNavigation: true,
        blocks: [
          {
            id: crypto.randomUUID(),
            type: 'TEXT',
            title: 'Our school',
            body: 'Add your school’s history, values and educational approach here.',
            imageUrl: '',
            imageAlt: '',
            link: '',
            linkLabel: '',
          },
        ],
      },
    ],
    posts: [],
    gallery: [],
    staff: [],
    downloads: [],
  };
}
