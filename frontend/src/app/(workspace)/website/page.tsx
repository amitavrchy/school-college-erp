'use client';
import { useEffect, useState, useRef, useId } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  Globe,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, PageTitle, Panel, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { post, displayDate } from '@/lib/api';
import type { SiteBlock, SiteContent } from '@/lib/school-site';
import '@/app/website-editor.css';

function Field({
  label,
  value,
  onChange,
  multiline = false,
  type = 'text',
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="cms-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          rows={5}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </div>
  );
}
const sections = [
  'Branding',
  'Pages',
  'Updates',
  'People & media',
  'Admissions & results',
  'Domains',
  'History',
  'Enquiries',
];
export default function WebsiteEditor() {
  const { can, organization } = useCampus(),
    allowed = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL');
  const { data, loading, error, reload } = useData(allowed ? 'website' : null);
  const { data: inquiries, reload: reloadInquiries } = useData(
    data?.site ? 'website/inquiries' : null,
  );
  const loadedSite = useRef<string | null>(null);
  const [content, setContent] = useState<SiteContent | null>(null),
    [version, setVersion] = useState(1),
    [dirty, setDirty] = useState(false),
    [tab, setTab] = useState('Branding'),
    [pageIndex, setPageIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [toast, setToast] = useState(''),
    [subdomain, setSubdomain] = useState(''),
    [domain, setDomain] = useState(''),
    [preview, setPreview] = useState(''),
    [note, setNote] = useState<Record<string, string>>({});
  useEffect(() => {
    if (
      data?.site &&
      data.site.organizationId === organization?.id &&
      (!dirty || loadedSite.current !== data.site.id)
    ) {
      const switched = loadedSite.current !== data.site.id;
      loadedSite.current = data.site.id;
      setContent(structuredClone(data.site.draft));
      setVersion(data.site.revision);
      setDirty(false);
      if (switched) {
        setPageIndex(0);
        setPreview('');
      }
    }
    if (!data?.site) setSubdomain(organization?.slug || '');
  }, [data, organization?.slug]); // Preserve unsaved edits across background refreshes.
  function mutate(fn: (draft: SiteContent) => void) {
    setContent((old) => {
      if (!old) return old;
      const next = structuredClone(old);
      fn(next);
      return next;
    });
    setDirty(true);
    setPreview('');
  }
  function change<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    mutate((d) => {
      d[key] = value;
    });
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setFailure('');
    try {
      await fn();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!content) return;
    const saved = await post('website/draft', { revision: version, content }, 'PATCH');
    setVersion(saved.revision);
    setContent(saved.draft);
    setDirty(false);
    setToast('Draft saved');
    await reload();
  }
  const page = content?.pages[pageIndex] || content?.pages[0];
  function move<T>(items: T[], index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
  }
  function blockValue(index: number, key: keyof SiteBlock, value: string) {
    mutate((d) => {
      (d.pages[pageIndex].blocks[index] as any)[key] = value;
    });
  }
  async function upload(file: File) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const result = await post('website/assets', {
      fileName: file.name,
      mimeType: file.type,
      base64,
    });
    setToast('Public media uploaded. Choose where to use it.');
    await reload();
    return result;
  }
  if (!allowed)
    return <State error="Website editing requires an institution administrator or principal." />;
  if (!data) return <State loading={loading} error={error} onRetry={reload} />;
  if (data.site && data.site.organizationId !== organization?.id) return <State loading />;
  return (
    <div className="cms-editor">
      <PageTitle
        eyebrow="YOUR SCHOOL, ONLINE"
        title="Website studio"
        description="Create your school’s public website, publish updates and connect your domain."
      >
        {data.site && (
          <>
            <Button
              variant="secondary"
              busy={busy}
              disabled={dirty}
              onClick={() =>
                action(async () => {
                  const p = await post('website/preview');
                  setPreview(p.url);
                  setToast('Private draft preview is ready');
                })
              }
            >
              Preview saved draft
              <ArrowUpRight size={16} />
            </Button>
            <Button variant="secondary" busy={busy} disabled={!dirty} onClick={() => action(save)}>
              <Save size={16} />
              Save draft
            </Button>
            <Button
              busy={busy}
              disabled={dirty}
              onClick={() =>
                action(async () => {
                  await post('website/publish', { revision: version });
                  setToast('Website published');
                  await reload();
                })
              }
            >
              Publish saved draft
              <Globe size={16} />
            </Button>
          </>
        )}
      </PageTitle>
      {failure && (
        <div className="cms-alert" role="alert">
          {failure}
        </div>
      )}
      {!data.site ? (
        <Panel>
          <div className="cms-setup">
            <Globe size={40} strokeWidth={1.2} />
            <h2>Give your school an address of its own.</h2>
            <p>
              Start with a school subdomain. You can connect your custom domain after creating the
              website.
            </p>
            <Field
              label="School subdomain"
              value={subdomain}
              onChange={(v) => setSubdomain(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
            <p className="cms-hint">
              {subdomain || 'yourschool'}.{data.baseDomain}
            </p>
            <Button
              busy={busy}
              disabled={subdomain.length < 3}
              onClick={() =>
                action(async () => {
                  await post('website', { subdomain });
                  await reload();
                  setToast('Website draft created');
                })
              }
            >
              Create school website
              <ArrowUpRight size={16} />
            </Button>
          </div>
        </Panel>
      ) : (
        content && (
          <>
            <div className="cms-status">
              <div>
                <Badge>{data.site.published ? 'PUBLISHED' : 'DRAFT'}</Badge>
                <span>
                  Draft v{version}
                  {dirty ? ' · Unsaved changes' : ''}
                  {data.site.publishedRevision ? ' · Live v' + data.site.publishedRevision : ''}
                </span>
              </div>
              <div>
                {preview && (
                  <a href={preview} target="_blank" rel="noreferrer">
                    Open draft preview
                    <ArrowUpRight size={16} />
                  </a>
                )}
                {data.site.published && (
                  <Link href={'/school/' + data.site.subdomain} target="_blank">
                    Open public website
                    <ArrowUpRight size={16} />
                  </Link>
                )}
              </div>
            </div>
            {dirty && (
              <p className="cms-save-note">
                Save your changes before previewing or publishing. The live website keeps its last
                published version.
              </p>
            )}
            <div className="cms-layout">
              <nav className="cms-sidebar" aria-label="Website editor sections">
                {sections.map((name) => (
                  <button
                    key={name}
                    aria-current={tab === name ? 'page' : undefined}
                    onClick={() => {
                      setTab(name);
                      if (name === 'Enquiries') void reloadInquiries();
                    }}
                  >
                    {name}
                    {name === 'Enquiries' &&
                      !!inquiries?.filter((v: any) => v.status === 'NEW').length && (
                        <span>{inquiries.filter((v: any) => v.status === 'NEW').length}</span>
                      )}
                  </button>
                ))}
              </nav>
              <div className="cms-canvas">
                {tab === 'Branding' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">SCHOOL IDENTITY</span>
                        <h2>Make it your school’s website.</h2>
                        <p>Content stays separate from the live site until you publish.</p>
                      </div>
                    </div>
                    <div className="cms-fields">
                      <Field
                        label="School display name"
                        value={content.name}
                        onChange={(v) => change('name', v)}
                      />
                      <Field
                        label="School tagline"
                        value={content.tagline}
                        onChange={(v) => change('tagline', v)}
                      />
                      <Field
                        label="SEO description"
                        value={content.description}
                        onChange={(v) => change('description', v)}
                        multiline
                      />
                      <label className="cms-field">
                        Website theme
                        <select
                          value={content.theme}
                          onChange={(e) => change('theme', e.target.value as SiteContent['theme'])}
                        >
                          <option value="ACADEMY">Academy — formal school prospectus</option>
                          <option value="MODERN">Modern — clear contemporary typography</option>
                          <option value="CLASSIC">
                            Classic — warm traditional school identity
                          </option>
                        </select>
                      </label>
                      <Field
                        label="Brand accent colour"
                        type="color"
                        value={content.accent}
                        onChange={(v) => change('accent', v)}
                      />
                      <Field
                        label="Logo image URL"
                        value={content.logoUrl}
                        onChange={(v) => change('logoUrl', v)}
                        placeholder="Upload media, then use its URL"
                      />
                      <Field
                        label="Homepage campus image URL"
                        value={content.heroUrl}
                        onChange={(v) => change('heroUrl', v)}
                      />
                      <Field
                        label="Public contact email"
                        value={content.email}
                        onChange={(v) => change('email', v)}
                      />
                      <Field
                        label="Public phone number"
                        value={content.phone}
                        onChange={(v) => change('phone', v)}
                      />
                      <Field
                        label="School address"
                        value={content.address}
                        onChange={(v) => change('address', v)}
                        multiline
                      />
                      <Field
                        label="Principal’s name"
                        value={content.principalName}
                        onChange={(v) => change('principalName', v)}
                      />
                      <Field
                        label="Principal’s message"
                        value={content.principalMessage}
                        onChange={(v) => change('principalMessage', v)}
                        multiline
                      />
                    </div>
                  </Panel>
                )}
                {tab === 'Pages' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">STRUCTURED PAGE BUILDER</span>
                        <h2>Pages & content blocks</h2>
                        <p>
                          Add a hero, text, features, an image or a call to action. Use the arrows
                          to arrange the page.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          mutate((d) => {
                            d.pages.push({
                              id: crypto.randomUUID(),
                              slug: 'page-' + (d.pages.length + 1),
                              title: 'New page',
                              description: '',
                              inNavigation: true,
                              blocks: [],
                            });
                          });
                          setPageIndex(content.pages.length);
                        }}
                        disabled={content.pages.length >= 20}
                      >
                        <Plus size={16} />
                        Add page
                      </Button>
                    </div>
                    <div className="cms-page-selector">
                      {content.pages.map((p, i) => (
                        <button
                          key={p.id}
                          aria-pressed={pageIndex === i}
                          onClick={() => setPageIndex(i)}
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                    {page && (
                      <>
                        <div className="cms-fields">
                          <Field
                            label="Page title"
                            value={page.title}
                            onChange={(v) =>
                              mutate((d) => {
                                d.pages[pageIndex].title = v;
                              })
                            }
                          />
                          <Field
                            label="Page URL slug"
                            value={page.slug}
                            onChange={(v) =>
                              mutate((d) => {
                                d.pages[pageIndex].slug = v;
                              })
                            }
                          />
                          <Field
                            label="Page SEO description"
                            value={page.description}
                            onChange={(v) =>
                              mutate((d) => {
                                d.pages[pageIndex].description = v;
                              })
                            }
                          />
                          <label className="cms-checkbox">
                            <input
                              type="checkbox"
                              checked={page.inNavigation}
                              onChange={(e) =>
                                mutate((d) => {
                                  d.pages[pageIndex].inNavigation = e.target.checked;
                                })
                              }
                            />
                            Show in school navigation
                          </label>
                        </div>
                        <div className="cms-page-tools">
                          <Button
                            variant="ghost"
                            disabled={pageIndex === 0}
                            onClick={() => {
                              mutate((d) => move(d.pages, pageIndex, -1));
                              setPageIndex(pageIndex - 1);
                            }}
                          >
                            <ArrowUp size={16} />
                            Move page up
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={pageIndex === content.pages.length - 1}
                            onClick={() => {
                              mutate((d) => move(d.pages, pageIndex, 1));
                              setPageIndex(pageIndex + 1);
                            }}
                          >
                            <ArrowDown size={16} />
                            Move page down
                          </Button>
                          <Button
                            variant="danger"
                            disabled={page.slug === 'home'}
                            onClick={() => {
                              mutate((d) => {
                                d.pages.splice(pageIndex, 1);
                              });
                              setPageIndex(0);
                            }}
                          >
                            Remove page
                          </Button>
                        </div>
                        <div className="cms-blocks">
                          {page.blocks.map((b, i) => (
                            <fieldset className="cms-block" key={b.id}>
                              <legend>
                                {i + 1}. {b.type.toLowerCase()} block
                              </legend>
                              <div className="cms-block-tools">
                                <button
                                  aria-label={'Move block ' + (i + 1) + ' up'}
                                  disabled={!i}
                                  onClick={() =>
                                    mutate((d) => move(d.pages[pageIndex].blocks, i, -1))
                                  }
                                >
                                  <ArrowUp size={17} />
                                </button>
                                <button
                                  aria-label={'Move block ' + (i + 1) + ' down'}
                                  disabled={i === page.blocks.length - 1}
                                  onClick={() =>
                                    mutate((d) => move(d.pages[pageIndex].blocks, i, 1))
                                  }
                                >
                                  <ArrowDown size={17} />
                                </button>
                                <button
                                  aria-label={'Remove block ' + (i + 1)}
                                  onClick={() =>
                                    mutate((d) => {
                                      d.pages[pageIndex].blocks.splice(i, 1);
                                    })
                                  }
                                >
                                  <Trash2 size={17} />
                                </button>
                              </div>
                              <div className="cms-fields">
                                <Field
                                  label="Block heading"
                                  value={b.title}
                                  onChange={(v) => blockValue(i, 'title', v)}
                                />
                                <label className="cms-field">
                                  Block type
                                  <select
                                    value={b.type}
                                    onChange={(e) => blockValue(i, 'type', e.target.value)}
                                  >
                                    {['HERO', 'TEXT', 'FEATURES', 'IMAGE', 'CTA'].map((v) => (
                                      <option key={v}>{v}</option>
                                    ))}
                                  </select>
                                </label>
                                <Field
                                  label="Block text"
                                  value={b.body}
                                  onChange={(v) => blockValue(i, 'body', v)}
                                  multiline
                                />
                                <Field
                                  label="Block image URL"
                                  value={b.imageUrl}
                                  onChange={(v) => blockValue(i, 'imageUrl', v)}
                                />
                                <Field
                                  label="Image alternative text"
                                  value={b.imageAlt}
                                  onChange={(v) => blockValue(i, 'imageAlt', v)}
                                />
                                <Field
                                  label="Button link"
                                  value={b.link}
                                  onChange={(v) => blockValue(i, 'link', v)}
                                  placeholder="/admissions, /results, /contact or HTTPS URL"
                                />
                                <Field
                                  label="Button label"
                                  value={b.linkLabel}
                                  onChange={(v) => blockValue(i, 'linkLabel', v)}
                                />
                              </div>
                            </fieldset>
                          ))}
                        </div>
                        <Button
                          variant="secondary"
                          disabled={page.blocks.length >= 30}
                          onClick={() =>
                            mutate((d) => {
                              d.pages[pageIndex].blocks.push({
                                id: crypto.randomUUID(),
                                type: 'TEXT',
                                title: 'New section',
                                body: '',
                                imageUrl: '',
                                imageAlt: '',
                                link: '',
                                linkLabel: '',
                              });
                            })
                          }
                        >
                          <Plus size={16} />
                          Add content block
                        </Button>
                      </>
                    )}
                  </Panel>
                )}
                {tab === 'Updates' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">SCHOOL COMMUNICATION</span>
                        <h2>News, notices & events</h2>
                        <p>
                          Schedule publication, pin important updates and set an optional expiry.
                          These public posts are separate from private ERP notices.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        disabled={content.posts.length >= 100}
                        onClick={() =>
                          mutate((d) =>
                            d.posts.unshift({
                              id: crypto.randomUUID(),
                              slug: 'update-' + Date.now(),
                              title: 'New school update',
                              body: '',
                              category: 'NEWS',
                              pinned: false,
                              publishAt: new Date().toISOString(),
                              expiresAt: null,
                              eventDate: null,
                              attachmentUrl: '',
                            }),
                          )
                        }
                      >
                        <Plus size={16} />
                        Add update
                      </Button>
                    </div>
                    {!content.posts.length && (
                      <div className="cms-empty">
                        No public updates yet. Add your first announcement.
                      </div>
                    )}
                    {content.posts.map((p, i) => (
                      <fieldset className="cms-block" key={p.id}>
                        <legend>{p.title}</legend>
                        <div className="cms-fields">
                          <Field
                            label="Update title"
                            value={p.title}
                            onChange={(v) =>
                              mutate((d) => {
                                d.posts[i].title = v;
                              })
                            }
                          />
                          <Field
                            label="Update URL slug"
                            value={p.slug}
                            onChange={(v) =>
                              mutate((d) => {
                                d.posts[i].slug = v;
                              })
                            }
                          />
                          <label className="cms-field">
                            Category
                            <select
                              value={p.category}
                              onChange={(e) =>
                                mutate((d) => {
                                  d.posts[i].category = e.target.value as any;
                                })
                              }
                            >
                              {['NEWS', 'NOTICE', 'EVENT'].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </label>
                          <Field
                            label="Update body"
                            multiline
                            value={p.body}
                            onChange={(v) =>
                              mutate((d) => {
                                d.posts[i].body = v;
                              })
                            }
                          />
                          {(['publishAt', 'expiresAt', 'eventDate'] as const).map((key) => (
                            <Field
                              key={key}
                              type="datetime-local"
                              label={
                                key === 'publishAt'
                                  ? 'Publish at'
                                  : key === 'expiresAt'
                                    ? 'Expires at (optional)'
                                    : 'Event date (optional)'
                              }
                              value={
                                p[key]
                                  ? new Date(
                                      new Date(p[key]!).getTime() -
                                        new Date(p[key]!).getTimezoneOffset() * 60000,
                                    )
                                      .toISOString()
                                      .slice(0, 16)
                                  : ''
                              }
                              onChange={(v) =>
                                mutate((d) => {
                                  d.posts[i][key] = v
                                    ? new Date(v).toISOString()
                                    : key === 'publishAt'
                                      ? new Date().toISOString()
                                      : (null as any);
                                })
                              }
                            />
                          ))}
                          <Field
                            label="Attachment URL"
                            value={p.attachmentUrl}
                            onChange={(v) =>
                              mutate((d) => {
                                d.posts[i].attachmentUrl = v;
                              })
                            }
                          />
                          <label className="cms-checkbox">
                            <input
                              type="checkbox"
                              checked={p.pinned}
                              onChange={(e) =>
                                mutate((d) => {
                                  d.posts[i].pinned = e.target.checked;
                                })
                              }
                            />
                            Pin this update
                          </label>
                        </div>
                        <Button
                          variant="danger"
                          onClick={() =>
                            mutate((d) => {
                              d.posts.splice(i, 1);
                            })
                          }
                        >
                          Remove update
                        </Button>
                      </fieldset>
                    ))}
                  </Panel>
                )}
                {tab === 'People & media' && (
                  <>
                    <Panel>
                      <div className="cms-panel-heading">
                        <div>
                          <span className="eyebrow">PUBLIC MEDIA LIBRARY</span>
                          <h2>Images & downloadable documents</h2>
                          <p>
                            JPEG, PNG, WebP or PDF, up to 5 MB each. Uploaded files are publicly
                            accessible; use only material intended for the school website.
                          </p>
                        </div>
                        <label className="button secondary cms-upload">
                          <Upload size={17} />
                          Upload public media
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            disabled={busy}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f)
                                action(async () => {
                                  await upload(f);
                                });
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      <p className="cms-hint">
                        {data.site.assets.length} / 100 files · 100 MB total allowance
                      </p>
                      <div className="cms-assets">
                        {data.site.assets.map((a: any) => (
                          <article key={a.id}>
                            {a.mimeType.startsWith('image/') ? (
                              <img src={'/api/public-websites/media/' + a.id} alt={a.fileName} />
                            ) : (
                              <FileTextIcon />
                            )}
                            <strong>{a.fileName}</strong>
                            <span>{Math.ceil(a.size / 1024)} KB</span>
                            <input
                              readOnly
                              aria-label={'Public URL for ' + a.fileName}
                              value={'/api/public-websites/media/' + a.id}
                            />
                            <Button
                              variant="ghost"
                              onClick={() =>
                                action(async () => {
                                  await navigator.clipboard.writeText(
                                    '/api/public-websites/media/' + a.id,
                                  );
                                  setToast('Public media URL copied');
                                })
                              }
                            >
                              Copy media URL
                            </Button>
                            {a.mimeType.startsWith('image/') && (
                              <div>
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    change('heroUrl', '/api/public-websites/media/' + a.id)
                                  }
                                >
                                  Use as campus image
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() =>
                                    change('logoUrl', '/api/public-websites/media/' + a.id)
                                  }
                                >
                                  Use as logo
                                </Button>
                                <Button
                                  variant="ghost"
                                  disabled={content.gallery.length >= 60}
                                  onClick={() =>
                                    mutate((d) => {
                                      d.gallery.push({
                                        url: '/api/public-websites/media/' + a.id,
                                        caption: '',
                                        alt: a.fileName,
                                      });
                                    })
                                  }
                                >
                                  Add to gallery
                                </Button>
                              </div>
                            )}
                            {a.mimeType === 'application/pdf' && (
                              <Button
                                variant="ghost"
                                disabled={content.downloads.length >= 60}
                                onClick={() =>
                                  mutate((d) => {
                                    d.downloads.push({
                                      title: a.fileName,
                                      url: '/api/public-websites/media/' + a.id,
                                    });
                                  })
                                }
                              >
                                Add to downloads
                              </Button>
                            )}
                            <Button
                              variant="danger"
                              disabled={dirty || busy}
                              onClick={() =>
                                action(async () => {
                                  await post('website/assets/' + a.id, undefined, 'DELETE');
                                  await reload();
                                  setToast('Unused media removed');
                                })
                              }
                            >
                              Delete unused file
                            </Button>
                          </article>
                        ))}
                      </div>
                    </Panel>
                    <Panel>
                      <h2>School gallery</h2>
                      <div className="cms-collection">
                        {content.gallery.map((g, i) => (
                          <div className="cms-collection-row" key={i}>
                            <Field
                              label="Gallery image URL"
                              value={g.url}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.gallery[i].url = v;
                                })
                              }
                            />
                            <Field
                              label="Gallery caption"
                              value={g.caption}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.gallery[i].caption = v;
                                })
                              }
                            />
                            <Field
                              label="Gallery alternative text"
                              value={g.alt}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.gallery[i].alt = v;
                                })
                              }
                            />
                            <Button
                              variant="danger"
                              onClick={() =>
                                mutate((d) => {
                                  d.gallery.splice(i, 1);
                                })
                              }
                            >
                              Remove photo
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          mutate((d) => {
                            d.gallery.push({ url: '', caption: '', alt: '' });
                          })
                        }
                        disabled={content.gallery.length >= 60}
                      >
                        <ImagePlus size={17} />
                        Add gallery photo
                      </Button>
                    </Panel>
                    <Panel>
                      <h2>Faculty & staff profiles</h2>
                      <div className="cms-collection">
                        {content.staff.map((s, i) => (
                          <div className="cms-collection-row" key={i}>
                            <Field
                              label="Staff name"
                              value={s.name}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.staff[i].name = v;
                                })
                              }
                            />
                            <Field
                              label="Staff role"
                              value={s.role}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.staff[i].role = v;
                                })
                              }
                            />
                            <Field
                              label="Staff photo URL"
                              value={s.photoUrl}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.staff[i].photoUrl = v;
                                })
                              }
                            />
                            <Button
                              variant="danger"
                              onClick={() =>
                                mutate((d) => {
                                  d.staff.splice(i, 1);
                                })
                              }
                            >
                              Remove profile
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          mutate((d) => {
                            d.staff.push({ name: '', role: '', photoUrl: '' });
                          })
                        }
                        disabled={content.staff.length >= 100}
                      >
                        <Plus size={17} />
                        Add faculty profile
                      </Button>
                    </Panel>
                    <Panel>
                      <h2>Download centre</h2>
                      <div className="cms-collection">
                        {content.downloads.map((s, i) => (
                          <div className="cms-collection-row" key={i}>
                            <Field
                              label="Document title"
                              value={s.title}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.downloads[i].title = v;
                                })
                              }
                            />
                            <Field
                              label="Document URL"
                              value={s.url}
                              onChange={(v) =>
                                mutate((d) => {
                                  d.downloads[i].url = v;
                                })
                              }
                            />
                            <Button
                              variant="danger"
                              onClick={() =>
                                mutate((d) => {
                                  d.downloads.splice(i, 1);
                                })
                              }
                            >
                              Remove document
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          mutate((d) => {
                            d.downloads.push({ title: '', url: '' });
                          })
                        }
                        disabled={content.downloads.length >= 60}
                      >
                        <Plus size={17} />
                        Add downloadable document
                      </Button>
                    </Panel>
                  </>
                )}
                {tab === 'Admissions & results' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">FAMILY SELF-SERVICE</span>
                        <h2>Admissions & public results</h2>
                        <p>
                          Admissions connect to your institution’s existing application form. Result
                          lookups use published ERP examinations, not manually entered website
                          marks.
                        </p>
                      </div>
                    </div>
                    <label className="cms-checkbox">
                      <input
                        type="checkbox"
                        checked={content.admissionsOpen}
                        onChange={(e) => change('admissionsOpen', e.target.checked)}
                      />
                      Show online admission application link
                    </label>
                    <Field
                      label="Admission requirements and instructions"
                      value={content.admissionsText}
                      onChange={(v) => change('admissionsText', v)}
                      multiline
                    />
                    <hr className="cms-divider" />
                    <label className="cms-checkbox">
                      <input
                        type="checkbox"
                        checked={content.resultsEnabled}
                        onChange={(e) => change('resultsEnabled', e.target.checked)}
                      />
                      Enable public examination result lookup
                    </label>
                    <label className="cms-field">
                      Result access policy
                      <select
                        value={content.resultAccess}
                        onChange={(e) =>
                          change('resultAccess', e.target.value as SiteContent['resultAccess'])
                        }
                      >
                        <option value="ROLL_DOB">Roll number + date of birth (recommended)</option>
                        <option value="ROLL_ONLY">Roll number only</option>
                      </select>
                    </label>
                    {content.resultAccess === 'ROLL_ONLY' && (
                      <label className="cms-checkbox cms-consent">
                        <input
                          type="checkbox"
                          checked={content.rollOnlyConsent}
                          onChange={(e) => change('rollOnlyConsent', e.target.checked)}
                        />
                        Our school authorizes public access to published marks by exam, class and
                        roll number without date-of-birth verification.
                      </label>
                    )}
                    <div className="info-banner section-space">
                      <ShieldCheckIcon /> Only published results from this institution are returned.
                      Birth dates, guardian phone numbers and private student records are never
                      included in the result response.
                    </div>
                  </Panel>
                )}
                {tab === 'Domains' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">YOUR SCHOOL’S ADDRESS</span>
                        <h2>Subdomain & custom domains</h2>
                        <p>
                          Your managed subdomain is available after publication. A custom domain
                          must pass ownership and routing checks.
                        </p>
                      </div>
                    </div>
                    <div className="cms-domain-default">
                      <Globe />
                      <div>
                        <strong>Included school subdomain</strong>
                        <a href={data.subdomainUrl} target="_blank" rel="noreferrer">
                          {data.subdomainUrl}
                          <ArrowUpRight size={15} />
                        </a>
                        <span className="cms-hint">
                          Local development uses .localhost. Production needs the platform’s
                          wildcard DNS and HTTPS gateway.
                        </span>
                      </div>
                    </div>
                    <Field
                      label="Custom domain hostname"
                      value={domain}
                      onChange={setDomain}
                      placeholder="www.yourschool.edu.bd"
                    />
                    <Button
                      variant="secondary"
                      disabled={!domain || busy}
                      onClick={() =>
                        action(async () => {
                          await post('website/domains', { hostname: domain });
                          setDomain('');
                          await reload();
                          setToast('Domain claim created. Add the DNS records below.');
                        })
                      }
                    >
                      <Plus size={17} />
                      Connect domain
                    </Button>
                    {data.site.domains.map((d: any) => (
                      <article className="cms-domain" key={d.id}>
                        <div>
                          <h3>{d.hostname}</h3>
                          <Badge>{d.status}</Badge>
                        </div>
                        <p>Add both records in your domain provider’s DNS panel:</p>
                        <div className="cms-dns-table">
                          <div>
                            <strong>TXT</strong>
                            <code>_campusone.{d.hostname}</code>
                            <code>campusone-verification={d.verificationToken}</code>
                          </div>
                          <div>
                            <strong>CNAME</strong>
                            <code>{d.hostname}</code>
                            <code>
                              {data.cnameTarget ||
                                'Platform routing target has not been configured yet'}
                            </code>
                          </div>
                        </div>
                        <p className="cms-hint">
                          DNS verification does not change your registrar settings. Once verified,
                          the configured HTTPS gateway can issue the certificate on the first visit.
                          Use a www/subdomain CNAME; apex domains with flattened records need
                          provider-specific DNS setup.
                        </p>
                        <div className="cms-page-tools">
                          <Button
                            variant="secondary"
                            busy={busy}
                            onClick={() =>
                              action(async () => {
                                const result = await post('website/domains/' + d.id + '/verify');
                                await reload();
                                setToast(
                                  result.status === 'VERIFIED'
                                    ? 'Domain ownership and routing verified'
                                    : 'DNS records do not match yet. Check the records and retry.',
                                );
                              })
                            }
                          >
                            Verify DNS records
                            <Check size={16} />
                          </Button>
                          <Button
                            variant="danger"
                            busy={busy}
                            onClick={() =>
                              action(async () => {
                                await post('website/domains/' + d.id, undefined, 'DELETE');
                                await reload();
                                setToast('Domain disconnected');
                              })
                            }
                          >
                            Disconnect domain
                          </Button>
                        </div>
                      </article>
                    ))}
                  </Panel>
                )}
                {tab === 'History' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">PUBLISHING HISTORY</span>
                        <h2>Review, restore, publish.</h2>
                        <p>
                          Published versions are preserved. Restoring creates a new draft; it does
                          not overwrite the live website until you publish again.
                        </p>
                      </div>
                    </div>
                    <div className="cms-history">
                      {data.site.revisions.map((v: any) => (
                        <div key={v.id}>
                          <div>
                            <strong>Published version {v.version}</strong>
                            <span>{displayDate(v.createdAt)}</span>
                          </div>
                          <Button
                            variant="secondary"
                            busy={busy}
                            disabled={dirty}
                            onClick={() =>
                              action(async () => {
                                await post('website/restore', {
                                  revision: version,
                                  revisionId: v.id,
                                });
                                setDirty(false);
                                await reload();
                                setToast('Version restored as a new draft');
                              })
                            }
                          >
                            Restore as draft
                          </Button>
                        </div>
                      ))}
                    </div>
                    {!data.site.revisions.length && <p>No versions have been published yet.</p>}
                    <hr className="cms-divider" />
                    <h3>Take the website offline</h3>
                    <p>The draft and previous versions are preserved.</p>
                    <Button
                      variant="danger"
                      busy={busy}
                      disabled={!data.site.published}
                      onClick={() =>
                        action(async () => {
                          await post('website/unpublish');
                          await reload();
                          setToast('School website is now offline');
                        })
                      }
                    >
                      Unpublish website
                    </Button>
                  </Panel>
                )}
                {tab === 'Enquiries' && (
                  <Panel>
                    <div className="cms-panel-heading">
                      <div>
                        <span className="eyebrow">SCHOOL OFFICE INBOX</span>
                        <h2>Website enquiries</h2>
                        <p>
                          Review messages from the public contact form and keep track of follow-up.
                        </p>
                      </div>
                    </div>
                    {!inquiries?.length && (
                      <div className="cms-empty">No enquiries have been received.</div>
                    )}
                    {inquiries?.map((q: any) => (
                      <article className="cms-inquiry" key={q.id}>
                        <div>
                          <h3>{q.name}</h3>
                          <Badge>{q.status}</Badge>
                        </div>
                        <p>
                          <a href={'mailto:' + q.email}>{q.email}</a>
                          {q.phone ? ' · ' + q.phone : ''} · {displayDate(q.createdAt)}
                        </p>
                        <p className="cms-inquiry-message">{q.message}</p>
                        <Field
                          label={'Office note for ' + q.name}
                          value={note[q.id] ?? q.note ?? ''}
                          onChange={(v) => setNote((old) => ({ ...old, [q.id]: v }))}
                          multiline
                        />
                        <div className="cms-page-tools">
                          {['READ', 'RESOLVED', 'NEW'].map((status) => (
                            <Button
                              variant="secondary"
                              key={status}
                              busy={busy}
                              onClick={() =>
                                action(async () => {
                                  await post(
                                    'website/inquiries/' + q.id,
                                    { status, note: note[q.id] ?? q.note ?? '' },
                                    'PATCH',
                                  );
                                  await reloadInquiries();
                                  setToast('Enquiry updated');
                                })
                              }
                            >
                              {status === 'READ'
                                ? 'Mark read'
                                : status === 'RESOLVED'
                                  ? 'Mark resolved'
                                  : 'Reopen'}
                            </Button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </Panel>
                )}
              </div>
            </div>
          </>
        )
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </div>
  );
}
function FileTextIcon() {
  return (
    <div className="cms-file-icon">
      <Globe size={32} />
      <span>PDF DOCUMENT</span>
    </div>
  );
}
function ShieldCheckIcon() {
  return <Check size={18} />;
}
