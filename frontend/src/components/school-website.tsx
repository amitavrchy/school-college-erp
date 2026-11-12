'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Download,
  FileText,
  GraduationCap,
  Mail,
  MapPin,
  Menu,
  Phone,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { PublicSchoolSite, SiteBlock } from '@/lib/school-site';
import '@/app/school-website.css';

function accentInk(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0) > 0.179
    ? '#101b28'
    : '#ffffff';
}
async function publicRequest(path: string, body?: unknown) {
  const r = await fetch('/api/public-websites/' + path, {
    credentials: 'omit',
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'This request could not be completed');
  return data;
}
function Results({ slug }: { slug: string }) {
  const [options, setOptions] = useState<any>(null),
    [termId, setTerm] = useState(''),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    publicRequest(slug + '/results/options')
      .then((v) => {
        if (live) setOptions(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [slug]);
  const term = options?.terms.find((t: any) => t.id === termId);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      setResult(
        await publicRequest(slug + '/results', {
          termId,
          sectionId: fd.get('sectionId'),
          rollNumber: fd.get('rollNumber'),
          ...(options.access === 'ROLL_DOB' ? { dob: fd.get('dob') } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sw-section sw-wrap">
      <div className="sw-heading">
        <span className="sw-kicker">EXAMINATIONS</span>
        <h1>Find your result</h1>
        <p>Choose the published examination and class, then enter the student’s roll number.</p>
      </div>
      <div className="sw-result-layout">
        <form onSubmit={submit} className="sw-form">
          <div className="sw-field">
            <label htmlFor="school-result-exam">Examination</label>
            <select
              id="school-result-exam"
              required
              value={termId}
              onChange={(e) => {
                setTerm(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Select examination</option>
              {options?.terms.map((t: any) => (
                <option value={t.id} key={t.id}>
                  {t.name} · {t.session.name} · {t.session.campus.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sw-field">
            <label htmlFor="school-result-section">Class and section</label>
            <select
              id="school-result-section"
              name="sectionId"
              key={termId}
              required
              disabled={!termId}
            >
              <option value="">Select class and section</option>
              {options?.sections
                .filter((s: any) => s.sessionId === term?.sessionId)
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.schoolClass.name} / {s.name} · {s.shift}
                  </option>
                ))}
            </select>
          </div>
          <label>
            Roll number
            <input name="rollNumber" required maxLength={30} autoComplete="off" />
          </label>
          {options?.access === 'ROLL_DOB' && (
            <label>
              Date of birth
              <input type="date" name="dob" required />
            </label>
          )}
          <button className="sw-button" disabled={busy || !options || !options.terms.length}>
            {busy ? 'Looking up result…' : 'View published result'}
            <Search size={17} />
          </button>
          {error && (
            <p className="sw-error" role="alert">
              {error}
            </p>
          )}
          {options && !options.terms.length && <p>No examinations have been published yet.</p>}
          <p className="sw-small">
            If your details do not match, contact the school office. Unpublished marks are never
            shown here.
          </p>
        </form>
        {result ? (
          <article className="sw-result" aria-live="polite">
            <div className="sw-result-head">
              <GraduationCap size={32} />
              <div>
                <h2>{result.school}</h2>
                <p>
                  {result.exam} · {result.session}
                </p>
              </div>
            </div>
            <h3>{result.studentName}</h3>
            <p>
              Roll {result.rollNumber} · {result.className} / {result.section} · {result.campus}
            </p>
            <div className="sw-table-scroll">
              <table>
                <caption>Published subject results</caption>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Marks</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {result.marks.map((m: any) => (
                    <tr key={m.subject}>
                      <th scope="row">{m.subject}</th>
                      <td>
                        {m.absent ? 'Absent' : m.marks} / {m.maxMarks}
                      </td>
                      <td>{m.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sw-result-score">
              <strong>GPA {result.gpa.toFixed(2)}</strong>
              <span>
                {result.percentage}% · {result.failed ? 'Failed' : 'Passed'}
              </span>
            </div>
            <a className="sw-button" href={result.downloadUrl} download>
              Download result PDF <Download size={17} />
            </a>
            <p className="sw-small">
              For your privacy, the download link expires after five minutes.
            </p>
          </article>
        ) : (
          <aside className="sw-result-placeholder">
            <ShieldCheck size={42} strokeWidth={1.2} />
            <h2>Published by your school.</h2>
            <p>
              Your result will appear here after a matching lookup. Please keep the downloaded
              report private.
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}
function Contact({ data }: { data: PublicSchoolSite }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await publicRequest(data.subdomain + '/inquiries', Object.fromEntries(new FormData(form)));
      setMessage('Your enquiry has been sent to the school office.');
      form.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="sw-section sw-wrap">
      <div className="sw-heading">
        <span className="sw-kicker">THE SCHOOL OFFICE</span>
        <h1>Get in touch</h1>
        <p>Ask about admissions, a campus visit or school information.</p>
      </div>
      <div className="sw-contact-layout">
        <div className="sw-contact-details">
          {data.content.address && (
            <p>
              <MapPin />
              {data.content.address}
            </p>
          )}
          {data.content.phone && (
            <p>
              <Phone />
              {data.content.phone}
            </p>
          )}
          {data.content.email && (
            <p>
              <Mail />
              <a href={'mailto:' + data.content.email}>{data.content.email}</a>
            </p>
          )}
          <p>
            Student records and account requests should be handled through the guardian portal or
            directly with school staff.
          </p>
        </div>
        <form onSubmit={submit} className="sw-form">
          <label>
            Your name
            <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
          </label>
          <label>
            Email address
            <input name="email" type="email" required maxLength={200} autoComplete="email" />
          </label>
          <label>
            Phone number (optional)
            <input name="phone" maxLength={40} autoComplete="tel" />
          </label>
          <label>
            Your enquiry
            <textarea name="message" required minLength={10} maxLength={3000} rows={5} />
          </label>
          <div className="sw-honey" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <button className="sw-button" disabled={busy}>
            {busy ? 'Sending…' : 'Send enquiry'}
            <ArrowRight size={17} />
          </button>
          {message && <p role="status">{message}</p>}
          {error && (
            <p role="alert" className="sw-error">
              {error}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
export default function SchoolWebsite({
  data,
  path,
  base,
  previewToken,
}: {
  data: PublicSchoolSite;
  path: string[];
  base: string;
  previewToken?: string;
}) {
  const c = data.content,
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState('');
  const route = path[0] || 'home',
    page = c.pages.find((p) => p.slug === route);
  const href = (value: string) => {
    if (value.startsWith('https://')) return value;
    const target = base + (value === '/' ? '' : value);
    return target + (previewToken ? '?preview=' + encodeURIComponent(previewToken) : '') || '/';
  };
  const local = (url: string) =>
    url.startsWith('/api/public-websites/media/') ? data.appOrigin + url : url;
  function block(b: SiteBlock) {
    const image = b.imageUrl || (b.type === 'HERO' ? c.heroUrl : '');
    return (
      <section key={b.id} className={'sw-block sw-block-' + b.type.toLowerCase()}>
        <div className="sw-wrap sw-block-inner">
          <div>
            <span className="sw-kicker">{b.type === 'HERO' ? c.tagline : ''}</span>
            <h2>{b.title}</h2>
            <div className="sw-prose">
              {b.body.split('\n').map((line, i) => (
                <p key={i}>{line || '\u00a0'}</p>
              ))}
            </div>
            {b.link && (
              <a className="sw-button" href={b.link.startsWith('/') ? href(b.link) : b.link}>
                {b.linkLabel || 'Learn more'}
                <ArrowRight size={17} />
              </a>
            )}
          </div>
          {image && (
            <img
              src={local(image)}
              alt={b.imageAlt || c.name + ' campus'}
              loading={b.type === 'HERO' ? 'eager' : 'lazy'}
            />
          )}
        </div>
      </section>
    );
  }
  const categories: Record<string, string> = { news: 'NEWS', notices: 'NOTICE', events: 'EVENT' };
  const posts = c.posts.filter(
    (p) =>
      p.category === categories[route] &&
      (p.title + ' ' + p.body).toLowerCase().includes(query.toLowerCase()),
  );
  const date = (value: string) =>
    new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dhaka',
    });
  return (
    <div
      className={'school-web theme-' + c.theme.toLowerCase()}
      style={{ '--sw-accent': c.accent, '--sw-accent-ink': accentInk(c.accent) } as CSSProperties}
    >
      <a className="skip-link" href="#school-content">
        Skip to content
      </a>
      {data.preview && (
        <div className="sw-preview" role="status">
          Private draft preview · Not the published website{' '}
          <a href={data.appOrigin + '/website'}>Return to editor</a>
        </div>
      )}
      <div className="sw-topline">
        <div className="sw-wrap">
          <span>{c.tagline}</span>
          <a href={data.appOrigin + '/login'}>
            Student & guardian portal <ArrowRight size={14} />
          </a>
        </div>
      </div>
      <header className="sw-header">
        <div className="sw-wrap">
          <Link className="sw-school-brand" href={href('/')} onClick={() => setMobile(false)}>
            {c.logoUrl ? (
              <img src={local(c.logoUrl)} alt="" width={58} height={58} />
            ) : (
              <span className="sw-seal">
                <BookOpen size={30} />
              </span>
            )}
            <span>
              {c.name}
              <small>{c.description.slice(0, 100)}</small>
            </span>
          </Link>
          <button
            className="sw-menu"
            aria-label={mobile ? 'Close school menu' : 'Open school menu'}
            aria-expanded={mobile}
            aria-controls="school-site-menu"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
        <nav
          id="school-site-menu"
          aria-label="School website navigation"
          className={mobile ? 'sw-wrap sw-nav open' : 'sw-wrap sw-nav'}
        >
          {c.pages
            .filter((p) => p.inNavigation)
            .map((p) => (
              <Link
                href={href(p.slug === 'home' ? '/' : '/' + p.slug)}
                key={p.id}
                aria-current={route === p.slug ? 'page' : undefined}
                onClick={() => setMobile(false)}
              >
                {p.title}
              </Link>
            ))}
          {[
            ['Notices', 'notices'],
            ['Admissions', 'admissions'],
            ...(c.resultsEnabled ? [['Results', 'results']] : []),
            ['Contact', 'contact'],
          ].map(([title, url]) => (
            <Link
              href={href('/' + url)}
              key={url}
              aria-current={route === url ? 'page' : undefined}
              onClick={() => setMobile(false)}
            >
              {title}
            </Link>
          ))}
        </nav>
      </header>
      <main id="school-content">
        {page && (
          <>
            {route !== 'home' && (
              <div className="sw-wrap sw-page-heading">
                <span className="sw-kicker">{c.name}</span>
                <h1>{page.title}</h1>
                {page.description && <p>{page.description}</p>}
              </div>
            )}
            {route === 'home' && <h1 className="sw-sr-only">{c.name}</h1>}
            {page.blocks.map(block)}
            {route === 'home' && (
              <>
                <section className="sw-quick-links sw-wrap">
                  {[
                    [FileText, 'Notice board', 'notices'],
                    [GraduationCap, 'Exam results', 'results'],
                    [CalendarDays, 'School events', 'events'],
                    [BookOpen, 'Admissions', 'admissions'],
                  ]
                    .filter(([, title]) => title !== 'Exam results' || c.resultsEnabled)
                    .map(([Icon, title, url]: any) => (
                      <Link key={url} href={href('/' + url)}>
                        <Icon size={25} />
                        <span>{title}</span>
                        <ArrowRight size={18} />
                      </Link>
                    ))}
                </section>
                {c.principalMessage && (
                  <section className="sw-section sw-wrap sw-principal">
                    <span className="sw-kicker">FROM THE PRINCIPAL’S DESK</span>
                    <h2>A message to our school community</h2>
                    <div className="sw-prose">
                      {c.principalMessage.split('\n').map((p, i) => (
                        <p key={i}>{p}</p>
                      ))}
                    </div>
                    <strong>{c.principalName}</strong>
                  </section>
                )}
                <section className="sw-section sw-news-home sw-wrap">
                  <div className="sw-section-heading">
                    <div>
                      <span className="sw-kicker">AROUND OUR SCHOOL</span>
                      <h2>News & announcements</h2>
                    </div>
                    <Link href={href('/news')}>
                      All news <ArrowRight size={17} />
                    </Link>
                  </div>
                  <div className="sw-post-grid">
                    {c.posts.slice(0, 3).map((p) => (
                      <Link
                        className="sw-post"
                        key={p.id}
                        href={href(
                          '/' +
                            { NEWS: 'news', NOTICE: 'notices', EVENT: 'events' }[p.category] +
                            '/' +
                            p.slug,
                        )}
                      >
                        <span className="sw-kicker">
                          {p.category} · {date(p.publishAt)}
                        </span>
                        <h3>{p.title}</h3>
                        <p>{p.body.slice(0, 180)}</p>
                        <span>
                          Read more <ArrowRight size={16} />
                        </span>
                      </Link>
                    ))}
                    {!c.posts.length && <p>School news and announcements will appear here.</p>}
                  </div>
                </section>
              </>
            )}
          </>
        )}
        {route === 'results' &&
          (c.resultsEnabled ? (
            <Results slug={data.subdomain} />
          ) : (
            <section className="sw-section sw-wrap">
              <h1>Results</h1>
              <p>Public results are not enabled. Please contact the school office.</p>
            </section>
          ))}
        {route === 'contact' && <Contact data={data} />}
        {route === 'admissions' && (
          <section className="sw-section sw-wrap">
            <div className="sw-heading">
              <span className="sw-kicker">JOIN OUR SCHOOL</span>
              <h1>Admissions</h1>
              <p>
                {c.admissionsOpen
                  ? 'Applications are open.'
                  : 'Contact the admissions office for current availability.'}
              </p>
            </div>
            <div className="sw-prose">
              {c.admissionsText.split('\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {c.admissionsOpen && (
              <a
                className="sw-button"
                href={data.appOrigin + '/apply?school=' + encodeURIComponent(data.organizationSlug)}
              >
                Start an application
                <ArrowRight size={17} />
              </a>
            )}
            <Link className="sw-button sw-outline" href={href('/contact')}>
              Ask the admissions office
            </Link>
          </section>
        )}
        {categories[route] && (
          <section className="sw-section sw-wrap">
            {path[1] ? (
              (() => {
                const p = posts.find((p) => p.slug === path[1]);
                return (
                  p && (
                    <article className="sw-article">
                      <span className="sw-kicker">
                        {p.category} · {date(p.publishAt)}
                      </span>
                      <h1>{p.title}</h1>
                      {p.eventDate && (
                        <p>
                          <CalendarDays size={18} /> {date(p.eventDate)}
                        </p>
                      )}
                      <div className="sw-prose">
                        {p.body.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                      {p.attachmentUrl && (
                        <a className="sw-button" href={local(p.attachmentUrl)}>
                          Download attachment
                          <Download size={17} />
                        </a>
                      )}
                    </article>
                  )
                );
              })()
            ) : (
              <>
                <div className="sw-heading">
                  <span className="sw-kicker">SCHOOL UPDATES</span>
                  <h1>
                    {route === 'notices'
                      ? 'Notice board'
                      : route === 'events'
                        ? 'School events'
                        : 'School news'}
                  </h1>
                  <p>Published updates from the school office.</p>
                </div>
                <label className="sw-search">
                  Search updates
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by title or keyword"
                  />
                </label>
                <div className="sw-post-grid">
                  {posts.map((p) => (
                    <article className="sw-post" key={p.id}>
                      <span className="sw-kicker">
                        {p.pinned ? 'PINNED · ' : ''}
                        {date(p.publishAt)}
                      </span>
                      <h2>
                        <Link href={href('/' + route + '/' + p.slug)}>{p.title}</Link>
                      </h2>
                      {p.eventDate && <p>Event: {date(p.eventDate)}</p>}
                      <p>{p.body.slice(0, 200)}</p>
                      <Link href={href('/' + route + '/' + p.slug)}>
                        Read more
                        <ArrowRight size={16} />
                      </Link>
                    </article>
                  ))}
                </div>
                {!posts.length && <p>No matching updates are available.</p>}
              </>
            )}
          </section>
        )}
        {route === 'gallery' && (
          <section className="sw-section sw-wrap">
            <div className="sw-heading">
              <span className="sw-kicker">LIFE AT SCHOOL</span>
              <h1>Photo gallery</h1>
            </div>
            <div className="sw-gallery">
              {c.gallery.map((image, i) => (
                <figure key={i}>
                  <a href={local(image.url)} target="_blank" rel="noreferrer">
                    <img src={local(image.url)} alt={image.alt} loading="lazy" />
                  </a>
                  <figcaption>{image.caption}</figcaption>
                </figure>
              ))}
            </div>
            {!c.gallery.length && <p>Our school gallery is being prepared.</p>}
          </section>
        )}
        {route === 'faculty' && (
          <section className="sw-section sw-wrap">
            <div className="sw-heading">
              <span className="sw-kicker">OUR PEOPLE</span>
              <h1>Faculty & staff</h1>
            </div>
            <div className="sw-faculty">
              {c.staff.map((member, i) => (
                <article key={i}>
                  {member.photoUrl ? (
                    <img src={local(member.photoUrl)} alt={member.name} loading="lazy" />
                  ) : (
                    <GraduationCap size={45} />
                  )}
                  <h2>{member.name}</h2>
                  <p>{member.role}</p>
                </article>
              ))}
            </div>
            {!c.staff.length && <p>Faculty profiles will be published here.</p>}
          </section>
        )}
        {route === 'downloads' && (
          <section className="sw-section sw-wrap">
            <div className="sw-heading">
              <span className="sw-kicker">SCHOOL RESOURCES</span>
              <h1>Downloads</h1>
            </div>
            <div className="sw-downloads">
              {c.downloads.map((item, i) => (
                <a key={i} href={local(item.url)}>
                  <FileText />
                  <span>{item.title}</span>
                  <Download size={20} />
                </a>
              ))}
            </div>
            {!c.downloads.length && <p>No documents have been published yet.</p>}
          </section>
        )}
      </main>
      <footer className="sw-footer">
        <div className="sw-wrap">
          <div>
            <h2>{c.name}</h2>
            <p>{c.tagline}</p>
            {c.address && <p>{c.address}</p>}
            {c.email && <a href={'mailto:' + c.email}>{c.email}</a>}
          </div>
          <nav aria-label="School resources">
            {[
              ['Faculty', 'faculty'],
              ['Gallery', 'gallery'],
              ['Downloads', 'downloads'],
              ['Events', 'events'],
              ['Contact', 'contact'],
            ].map(([title, url]) => (
              <Link key={url} href={href('/' + url)}>
                {title}
              </Link>
            ))}
          </nav>
        </div>
        <div className="sw-wrap sw-footer-bottom">
          <span>
            © {new Date().getFullYear()} {c.name}
          </span>
          <a href={data.appOrigin}>Powered by Campus One</a>
        </div>
      </footer>
    </div>
  );
}
