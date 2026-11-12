'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  GraduationCap,
  Menu,
  X,
  ShieldCheck,
  Library,
  Bus,
  NotebookPen,
  ClipboardCheck,
  FileText,
  Wallet,
  Users,
} from 'lucide-react';
import { useData } from '@/lib/use-data';
import { bdt, number } from '@/lib/api';
import '@/app/landing.css';

const roles = [
  {
    name: 'School leaders',
    heading: 'Know what needs your attention.',
    body: 'Review admission applications, follow fee collections and check attendance across your campuses. Give each member of staff the access their job needs.',
    items: [
      'Campus-wise records and reports',
      'Admission review and seat allocation',
      'Staff roles and approval controls',
    ],
  },
  {
    name: 'Teachers',
    heading: 'Your class, ready for the day.',
    body: 'Open your class register, mark attendance, set homework and enter marks. Keep the classroom record together, without carrying another stack of registers.',
    items: [
      'Daily and period attendance',
      'Homework, submissions and feedback',
      'Marks entry and moderated results',
    ],
  },
  {
    name: 'Families',
    heading: 'Stay involved, even after the school bell.',
    body: 'Parents can check their own children’s attendance, outstanding fees, homework and published results from a phone. No need to wait for the next parent meeting.',
    items: [
      'A private view of linked children',
      'Fee balances and payment receipts',
      'School notices and published report cards',
    ],
  },
];
const faqs = [
  [
    'How do bKash and Nagad subscriptions work?',
    'Send the displayed plan amount to the configured receiving account and submit your sender number and transaction reference. The platform administrator verifies the actual transfer before approval. A reference alone does not activate a plan.',
  ],
  [
    'Will another institution be able to see our records?',
    'No. Each institution has its own organization, campus memberships and access rules. Staff and families need the appropriate membership and role to access records.',
  ],
  [
    'Can we begin with a single campus?',
    'Yes. Start with the plan that fits your student, staff and campus capacity. You can request a different plan as your institution grows.',
  ],
  [
    'What happens when the 14-day trial ends?',
    'Choose a monthly or yearly subscription. If it expires, your core records remain available in read-only mode while your institution owner arranges renewal.',
  ],
  [
    'Can parents use Campus One on a mobile phone?',
    'Yes. The guardian workspace adapts to mobile screens. Parents see only their linked children’s records, published results and the family modules enabled by the institution.',
  ],
];
function Brand() {
  return (
    <Link href="/" className="school-brand">
      <span className="school-crest">
        <BookOpen size={26} strokeWidth={1.5} />
      </span>
      <span>
        Campus One<small>SCHOOL & COLLEGE MANAGEMENT</small>
      </span>
    </Link>
  );
}
function moveTab(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const current = tabs.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[index].focus();
  tabs[index].click();
}
function Register({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'school-register compact' : 'school-register'}>
      <div className="register-top">
        <span>
          <ClipboardCheck size={18} /> Class register
        </span>
        <span className="sample-label">SAMPLE</span>
      </div>
      <div className="register-class">
        <div>
          <strong>
            Class 7 <span> / Section A</span>
          </strong>
          <p>Morning shift · Daily attendance</p>
        </div>
        <span className="register-date">
          SUN
          <br />
          <b>15</b>
        </span>
      </div>
      <div className="register-table">
        <div className="register-row register-labels">
          <span>ROLL</span>
          <span>STUDENT NAME</span>
          <span>STATUS</span>
        </div>
        {[
          ['01', 'Nusrat Jahan', 'Present'],
          ['02', 'Arif Rahman', 'Present'],
          ['03', 'Sadia Islam', 'On leave'],
        ].map(([roll, name, status]) => (
          <div className="register-row" key={roll}>
            <span>{roll}</span>
            <strong>{name}</strong>
            <span className={status === 'Present' ? 'register-present' : 'register-leave'}>
              {status === 'Present' && <Check size={14} />}
              {status}
            </span>
          </div>
        ))}
      </div>
      <div className="register-footer">
        <span>
          <span className="school-dot" /> A record for every learner
        </span>
        <BookOpen size={17} />
      </div>
    </div>
  );
}
export default function Landing() {
  const [mobile, setMobile] = useState(false),
    [yearly, setYearly] = useState(false),
    [role, setRole] = useState(0),
    [demo, setDemo] = useState('Attendance');
  const { data: plans, error, loading, reload } = useData('saas/plans');
  const root = useRef<HTMLDivElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    root.current?.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobile(false);
        menuToggle.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [mobile]);
  return (
    <div className="school-site" ref={root}>
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <div className="school-topbar">
        <div className="school-wrap">
          <span>Built for the school day. Made for Bangladesh.</span>
          <Link href="/login">
            Staff, student & guardian login <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
      <header className="school-nav">
        <div className="school-wrap school-nav-inner">
          <Brand />
          <nav
            id="school-navigation"
            aria-label="Main navigation"
            className={mobile ? 'school-nav-links open' : 'school-nav-links'}
          >
            {[
              ['The school day', '#school-day'],
              ['For your school', '#people'],
              ['Pricing', '#pricing'],
              ['Questions', '#questions'],
            ].map(([label, href]) => (
              <a href={href} key={href} onClick={() => setMobile(false)}>
                {label}
              </a>
            ))}
            <div className="school-mobile-nav-actions">
              <Link href="/login" onClick={() => setMobile(false)}>
                Workspace login <ArrowUpRight size={16} />
              </Link>
              <Link href="/start" onClick={() => setMobile(false)}>
                Set up your school <ArrowRight size={16} />
              </Link>
            </div>
          </nav>
          <div className="school-nav-actions">
            <Link className="school-button school-button-navy" href="/start">
              Start your school <ArrowRight size={17} />
            </Link>
            <button
              ref={menuToggle}
              className="school-menu"
              aria-label={mobile ? 'Close menu' : 'Open menu'}
              aria-expanded={mobile}
              aria-controls="school-navigation"
              onClick={() => setMobile(!mobile)}
            >
              {mobile ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="landing-main">
        <section className="school-hero">
          <div className="school-hero-copy">
            <div className="school-eyebrow">
              <span /> FOR THE PEOPLE WHO RUN A SCHOOL
            </div>
            <h1>
              Let teachers
              <br />
              teach.
              <br />
              <em>Let schools thrive.</em>
            </h1>
            <p>
              From the first roll call to the final report card. Admissions, attendance, fees and
              results—together in one place, for your whole school.
            </p>
            <div className="school-hero-actions">
              <Link href="/start" className="school-button school-button-gold">
                Set up your school <ArrowRight size={19} />
              </Link>
              <a href="#school-day" className="school-underlink">
                See how it works <ArrowUpRight size={17} />
              </a>
            </div>
            <div className="school-trial">
              <Check size={16} /> 14-day free trial <span /> No card required
            </div>
          </div>
          <div className="school-hero-photo">
            <img
              src="/images/school/classroom.webp"
              alt="Children learning together at colourful tables in a Bangladesh school classroom"
              width="1800"
              height="1200"
              fetchPriority="high"
            />
            <div className="school-photo-caption">
              <span>IN THE CLASSROOM</span>
              <p>This is what the paperwork is for.</p>
            </div>
            <div className="school-hero-register">
              <Register compact />
            </div>
          </div>
        </section>
        <div className="school-subjects">
          <div className="school-wrap">
            <span>ONE SCHOOL. EVERY DEPARTMENT.</span>
            <div>
              <BookOpen size={19} /> Academics
            </div>
            <div>
              <ClipboardCheck size={19} /> Attendance
            </div>
            <div>
              <Wallet size={19} /> Accounts
            </div>
            <div>
              <Users size={19} /> Families
            </div>
          </div>
        </div>
        <section id="school-day" className="school-section school-wrap school-day">
          <div className="school-section-head" data-reveal>
            <div>
              <div className="school-eyebrow">01 / THE DAILY ROUTINE</div>
              <h2>
                The register. The receipt book.
                <br />
                <em>The report card.</em>
              </h2>
            </div>
            <p>
              Your staff already know the work. Campus One gives them a shared record, so the same
              information doesn’t have to be written down again and again.
            </p>
          </div>
          <div className="school-workbench" data-reveal>
            <div className="school-workbench-copy">
              <div
                className="school-tabs"
                role="tablist"
                aria-label="Explore school workflows"
                onKeyDown={moveTab}
              >
                {['Attendance', 'Fees', 'Results'].map((name) => (
                  <button
                    key={name}
                    role="tab"
                    id={`workflow-${name}`}
                    aria-selected={demo === name}
                    tabIndex={demo === name ? 0 : -1}
                    aria-controls="school-workflow-panel"
                    onClick={() => setDemo(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div
                id="school-workflow-panel"
                role="tabpanel"
                aria-labelledby={`workflow-${demo}`}
                tabIndex={0}
              >
                <span className="school-workbench-number">
                  {demo === 'Attendance' ? '08:30' : demo === 'Fees' ? '10:00' : '13:00'} / A SCHOOL
                  DAY
                </span>
                <h3>
                  {demo === 'Attendance'
                    ? 'The morning register, without the loose ends.'
                    : demo === 'Fees'
                      ? 'Every collection accounted for.'
                      : 'From marks entry to a report card.'}
                </h3>
                <p>
                  {demo === 'Attendance'
                    ? 'Mark your class, record approved leave and keep daily or period attendance. Families can follow their own child’s record.'
                    : demo === 'Fees'
                      ? 'Generate invoices, record partial payments and issue receipts. Accounts staff and families see the same outstanding balance.'
                      : 'Teachers enter marks. Authorized staff moderate and publish results. Families receive the published report, with a PDF to keep.'}
                </p>
                <Link href="/start" className="school-underlink">
                  Try it with your school <ArrowRight size={17} />
                </Link>
              </div>
            </div>
            <div className="school-workbench-preview" aria-live="polite">
              {demo === 'Attendance' ? (
                <Register />
              ) : demo === 'Fees' ? (
                <div className="school-document">
                  <div className="document-heading">
                    <Wallet size={23} />
                    <span>ACCOUNTS OFFICE · SAMPLE</span>
                  </div>
                  <h3>Fee collection receipt</h3>
                  <p>Student: Nusrat Jahan · Class 7 / A</p>
                  <div className="document-line">
                    <span>Monthly tuition</span>
                    <strong>৳2,000</strong>
                  </div>
                  <div className="document-line">
                    <span>Library fee</span>
                    <strong>৳100</strong>
                  </div>
                  <div className="document-line document-total">
                    <span>Total received</span>
                    <strong>৳2,100</strong>
                  </div>
                  <div className="document-stamp">
                    <Check size={18} /> PAYMENT RECORDED
                  </div>
                  <p className="document-note">Illustrative receipt · Not a payment confirmation</p>
                </div>
              ) : (
                <div className="school-document">
                  <div className="document-heading">
                    <GraduationCap size={25} />
                    <span>EXAMINATION OFFICE · SAMPLE</span>
                  </div>
                  <h3>Term examination</h3>
                  <p>Class 7 · Published result preview</p>
                  {[
                    ['Bangla', 'A+'],
                    ['English', 'A'],
                    ['Mathematics', 'A+'],
                  ].map(([subject, grade]) => (
                    <div className="document-line" key={subject}>
                      <span>{subject}</span>
                      <strong>{grade}</strong>
                    </div>
                  ))}
                  <div className="document-stamp">
                    <FileText size={18} /> PRINTABLE REPORT CARD
                  </div>
                  <p className="document-note">Illustrative grades · Not a student record</p>
                </div>
              )}
            </div>
          </div>
          <div className="school-departments">
            {[
              [FileText, 'Admissions', 'Application, merit list, offer and enrollment.'],
              [Library, 'Library', 'Books, loans, reservations and overdue charges.'],
              [Bus, 'Transport', 'Routes, seats and boarding records.'],
              [NotebookPen, 'Homework', 'Assignments, submissions and teacher feedback.'],
            ].map(([Icon, title, body]: any) => (
              <div key={title}>
                <Icon size={23} strokeWidth={1.5} />
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="school-people" id="people">
          <div className="school-wrap school-people-grid">
            <figure className="school-life-photo" data-reveal>
              <img
                src="/images/school/school-life.webp"
                alt="Pupils reading together at a wooden desk in a Friendship school in Bangladesh"
                width="1200"
                height="900"
                loading="lazy"
              />
              <figcaption>
                <span lang="bn">শিক্ষাই আগামীর ভিত্তি।</span>
                <span>For the classroom. And everyone behind it.</span>
              </figcaption>
            </figure>
            <div className="school-people-copy" data-reveal>
              <div className="school-eyebrow">02 / A SCHOOL IS ITS PEOPLE</div>
              <h2>
                One school.
                <br />
                <em>Different responsibilities.</em>
              </h2>
              <div
                className="school-tabs school-role-tabs"
                role="tablist"
                onKeyDown={moveTab}
                aria-label="Who uses Campus One"
              >
                {roles.map((item, i) => (
                  <button
                    key={item.name}
                    role="tab"
                    id={`role-${i}`}
                    aria-controls="school-role-panel"
                    aria-selected={role === i}
                    tabIndex={role === i ? 0 : -1}
                    onClick={() => setRole(i)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id="school-role-panel"
                aria-labelledby={`role-${role}`}
                tabIndex={0}
              >
                <h3>{roles[role].heading}</h3>
                <p>{roles[role].body}</p>
                <ul className="school-checklist">
                  {roles[role].items.map((item) => (
                    <li key={item}>
                      <Check size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
        <section className="school-wrap school-records">
          <div className="school-records-title">
            <ShieldCheck size={33} strokeWidth={1.4} />
            <h3>
              Your institution’s records.
              <br />
              Your institution’s responsibility.
            </h3>
          </div>
          <p>
            Each school gets its own workspace. Campus roles control staff access. Parents see only
            their linked children. Important approvals leave a record of who did what.
          </p>
          <span className="school-records-note">
            Separate institutions.
            <br />
            Clear permissions.
          </span>
        </section>
        <section className="school-section school-plans" id="pricing">
          <div className="school-wrap">
            <div className="school-section-head" data-reveal>
              <div>
                <div className="school-eyebrow">03 / PLAN FOR YOUR SCHOOL</div>
                <h2>
                  A practical plan.
                  <br />
                  <em>For the next academic year.</em>
                </h2>
              </div>
              <div className="school-pricing-intro">
                <p>
                  Choose by students, staff and campuses. Every plan starts with a 14-day trial.
                </p>
                <div className="school-price-toggle" aria-label="Billing period">
                  <button aria-pressed={!yearly} onClick={() => setYearly(false)}>
                    Monthly
                  </button>
                  <button aria-pressed={yearly} onClick={() => setYearly(true)}>
                    Yearly
                  </button>
                </div>
              </div>
            </div>
            {loading && <p role="status">Loading subscription plans…</p>}
            {error && (
              <div role="alert" className="school-plan-error">
                <p>Plans could not be loaded.</p>
                <button className="school-underlink" onClick={reload}>
                  Try again <ArrowRight size={16} />
                </button>
              </div>
            )}
            <div className="school-pricing-grid">
              {plans?.map((plan: any) => (
                <article
                  className={`lp-price-card school-price-card ${plan.code === 'GROWTH' ? 'featured' : ''}`}
                  key={plan.id}
                >
                  <div className="school-plan-name">
                    <h3>{plan.name}</h3>
                    {plan.code === 'GROWTH' && <span>FOR GROWING SCHOOLS</span>}
                  </div>
                  <p>{plan.description}</p>
                  <div className="lp-price school-price">
                    <strong>
                      {bdt(yearly ? Math.round(plan.annualMinor / 12) : plan.monthlyMinor)}
                    </strong>
                    <span>/ month</span>
                  </div>
                  <p className="lp-billed school-billed">
                    {yearly ? `${bdt(plan.annualMinor)} billed yearly` : 'Billed monthly'} · per
                    institution
                  </p>
                  <Link
                    href={`/start?plan=${plan.code}&period=${yearly ? 'YEARLY' : 'MONTHLY'}`}
                    className={`school-button ${plan.code === 'GROWTH' ? 'school-button-navy' : 'school-button-line'}`}
                  >
                    Start with {plan.name}
                    <ArrowRight size={17} />
                  </Link>
                  <ul className="school-checklist">
                    {[
                      `${number(plan.maxStudents)} student records`,
                      `${plan.maxCampuses} campus${plan.maxCampuses > 1 ? 'es' : ''}`,
                      `${plan.maxStaff} staff accounts`,
                      'Academics, fees & guardian portal',
                      ...(plan.features.includes('homework') ? ['Homework & feedback'] : []),
                      ...(plan.features.includes('library') ? ['Library circulation'] : []),
                      ...(plan.features.includes('transport') ? ['Transport operations'] : []),
                      ...(plan.features.includes('support') ? ['Support request tracking'] : []),
                    ].map((item) => (
                      <li key={item}>
                        <Check size={16} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <div className="school-payment-note">
              <Wallet size={23} />
              <p>
                <strong>Pay by bKash, Nagad or bank transfer.</strong> Submit your transaction
                reference from your subscription page. Your plan activates after the platform team
                verifies the received payment.
              </p>
              <span>MANUALLY VERIFIED</span>
            </div>
          </div>
        </section>
        <section className="school-section school-wrap school-faq" id="questions">
          <div>
            <div className="school-eyebrow">BEFORE YOU BEGIN</div>
            <h2>
              A few questions
              <br />
              <em>from the school office.</em>
            </h2>
            <p>The details you need before setting up your institution.</p>
          </div>
          <div>
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={20} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="school-enrol">
          <div className="school-wrap">
            <div>
              <div className="school-eyebrow">THE NEXT SCHOOL DAY STARTS HERE</div>
              <h2>
                Open a new chapter
                <br />
                for your school.
              </h2>
              <p>Set up your institution. Add your first class. Take it from there.</p>
            </div>
            <div>
              <Link href="/start" className="school-button school-button-gold">
                Set up your school <ArrowRight size={19} />
              </Link>
              <span>14 days to try it. No card required.</span>
            </div>
            <BookOpen
              className="school-enrol-book"
              size={220}
              strokeWidth={0.5}
              aria-hidden="true"
            />
          </div>
        </section>
      </main>
      <footer className="school-footer">
        <div className="school-wrap">
          <div className="school-footer-main">
            <div>
              <Brand />
              <p>For the work that makes a school work.</p>
            </div>
            <div>
              <a href="#school-day">The school day</a>
              <a href="#pricing">Pricing</a>
              <a href="#questions">Questions</a>
              <Link href="/login">
                Workspace login <ArrowUpRight size={15} />
              </Link>
            </div>
          </div>
          <div className="school-footer-bottom">
            <span>© {new Date().getFullYear()} Campus One. Built for Bangladesh.</span>
            <details className="school-photo-credits">
              <summary>
                Photography credits <ChevronDown size={14} />
              </summary>
              <p>
                Classroom:{' '}
                <a href="https://commons.wikimedia.org/wiki/File:Class_Room_International_Bangladesh_Hope_School.jpg">
                  Jubair1985
                </a>
                . Friendship School:{' '}
                <a href="https://commons.wikimedia.org/wiki/File:Friendship_School_2025_(2).jpg">
                  Aashaa
                </a>
                . Both <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>;
                resized, WebP conversion and display crops. Photographs show school life, not
                customer endorsements.
              </p>
            </details>
          </div>
        </div>
      </footer>
    </div>
  );
}
