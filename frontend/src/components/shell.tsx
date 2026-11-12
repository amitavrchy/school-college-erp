'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io } from 'socket.io-client';
import {
  ArrowUpRight,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Settings2,
  ShieldCheck,
  UserRoundPlus,
  Users,
  Wallet,
  Library,
  Bus,
  NotebookPen,
  LifeBuoy,
  CreditCard,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { State } from './ui';
interface AppContext {
  user: any;
  campus: any;
  campusId: string;
  sessionId: string;
  roles: string[];
  can: (...roles: string[]) => boolean;
  organization: any;
  features: string[];
  billing: boolean;
}
const CampusContext = createContext<AppContext>(null!);
export const useCampus = () => useContext(CampusContext);
const admins = ['SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL'];
const nav = [
  {
    href: '/overview',
    label: 'Overview',
    icon: LayoutDashboard,
    roles: [
      ...admins,
      'ACCOUNTS',
      'TEACHER',
      'CLASS_TEACHER',
      'ADMISSION_OFFICER',
      'LIBRARIAN',
      'TRANSPORT_MANAGER',
    ],
    group: 'WORKSPACE',
  },
  {
    href: '/students',
    label: 'Students',
    icon: Users,
    roles: [
      ...admins,
      'ACCOUNTS',
      'TEACHER',
      'CLASS_TEACHER',
      'ADMISSION_OFFICER',
      'LIBRARIAN',
      'TRANSPORT_MANAGER',
    ],
    group: 'WORKSPACE',
  },
  {
    href: '/admissions',
    label: 'Admissions',
    icon: UserRoundPlus,
    roles: [...admins, 'ADMISSION_OFFICER'],
    group: 'WORKSPACE',
  },
  {
    href: '/attendance',
    label: 'Attendance',
    icon: ClipboardCheck,
    roles: [...admins, 'TEACHER', 'CLASS_TEACHER'],
    group: 'WORKSPACE',
  },
  {
    href: '/academics',
    label: 'Academics',
    icon: BookOpen,
    roles: [...admins, 'TEACHER', 'CLASS_TEACHER'],
    group: 'WORKSPACE',
  },
  {
    href: '/exams',
    label: 'Exams & results',
    icon: GraduationCap,
    roles: [...admins, 'TEACHER', 'CLASS_TEACHER', 'GUARDIAN', 'STUDENT'],
    group: 'WORKSPACE',
  },
  {
    href: '/fees',
    label: 'Fees & payments',
    icon: Wallet,
    roles: [...admins, 'ACCOUNTS', 'GUARDIAN', 'STUDENT'],
    group: 'WORKSPACE',
  },
  {
    href: '/guardian',
    label: 'My family',
    icon: Users,
    roles: ['GUARDIAN', 'STUDENT'],
    group: 'WORKSPACE',
  },
  { href: '/notices', label: 'Notice board', icon: Megaphone, roles: [], group: 'MANAGEMENT' },
  {
    href: '/homework',
    label: 'Homework',
    icon: NotebookPen,
    roles: [...admins, 'TEACHER', 'CLASS_TEACHER', 'GUARDIAN', 'STUDENT'],
    group: 'WORKSPACE',
  },
  {
    href: '/library',
    label: 'Library',
    icon: Library,
    roles: [...admins, 'LIBRARIAN', 'GUARDIAN', 'STUDENT'],
    group: 'MANAGEMENT',
  },
  {
    href: '/transport',
    label: 'Transport',
    icon: Bus,
    roles: [...admins, 'TRANSPORT_MANAGER', 'GUARDIAN', 'STUDENT'],
    group: 'MANAGEMENT',
  },
  { href: '/support', label: 'Help & requests', icon: LifeBuoy, roles: [], group: 'MANAGEMENT' },
  {
    href: '/subscription',
    label: 'Subscription',
    icon: CreditCard,
    roles: ['SUPER_ADMIN'],
    group: 'MANAGEMENT',
  },
  {
    href: '/reports',
    label: 'Reports & insights',
    icon: ChartNoAxesCombined,
    roles: [...admins, 'ACCOUNTS', 'TEACHER', 'CLASS_TEACHER'],
    group: 'MANAGEMENT',
  },
  { href: '/settings', label: 'Settings', icon: Settings2, roles: [], group: 'MANAGEMENT' },
];
export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<any>(null),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false),
    [sessionId, setSessionId] = useState('');
  const campusId =
    typeof window !== 'undefined'
      ? localStorage.getItem('campus-id') || user?.roles[0]?.campusId || ''
      : '';
  const campus = user?.roles.find((r: any) => r.campusId === campusId)?.campus;
  const roles: string[] =
    user?.roles.filter((r: any) => r.campusId === campusId).map((r: any) => r.role) || [];
  const can = (...required: string[]) =>
    required.length === 0 || required.some((r) => roles.includes(r));
  const organization = campus?.organization;
  const features: string[] = organization?.subscription?.plan.features || [];
  const billing = !!user?.memberships?.some(
    (m: any) => m.organizationId === campus?.orgId && ['OWNER', 'ADMIN'].includes(m.role),
  );
  useEffect(() => {
    api('auth/me')
      .then(async (u) => {
        if (u.platformAdmin && !u.roles.length) {
          router.replace('/platform');
          return;
        }
        if (!u.roles.some((r: any) => r.campusId === localStorage.getItem('campus-id')))
          localStorage.setItem('campus-id', u.roles[0].campusId);
        const campuses = await api('campuses');
        const first = campuses.find((c: any) => c.id === localStorage.getItem('campus-id'));
        const saved = localStorage.getItem('session-id');
        setSessionId(
          first?.sessions.some((s: any) => s.id === saved)
            ? saved
            : first?.sessions.find((s: any) => s.status === 'ACTIVE')?.id || '',
        );
        setUser({ ...u, campuses });
      })
      .catch((e) => {
        if (e.status === 401) router.replace('/login');
        else setError(e.message);
      });
  }, [router]);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    if (!user || !campusId) return;
    const socket = io({
      path: '/api/socket.io',
      auth: { campusId },
      transports: ['polling'],
      withCredentials: true,
    });
    socket.on('refresh', () => window.dispatchEvent(new Event('campus-refresh')));
    return () => {
      socket.disconnect();
    };
  }, [user, campusId]);
  async function logout() {
    try {
      await post('auth/logout');
      localStorage.removeItem('campus-id');
      router.replace('/login');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!user)
    return (
      <main>
        <State loading={!error} error={error} onRetry={() => window.location.reload()} />
      </main>
    );
  const current = nav.find((n) => (n.href === '/' ? path === '/' : path.startsWith(n.href)));
  const initials = user.fullName
    .split(' ')
    .slice(0, 2)
    .map((s: string) => s[0])
    .join('');
  return (
    <CampusContext.Provider
      value={{ user, campus, campusId, sessionId, roles, can, organization, features, billing }}
    >
      <div
        className="app-shell"
        style={{ '--green': organization?.accentColor || '#22644f' } as React.CSSProperties}
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {open && (
          <button
            className="mobile-overlay"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          />
        )}
        <aside className={`sidebar ${open ? 'open' : ''}`}>
          <Link href="/overview" className="brand">
            <img src="/brand.svg" alt="" />
            <div>
              <strong>
                campus
                <span style={{ display: 'inline', color: '#678c74', fontSize: '22px' }}>one</span>
              </strong>
              <span title={organization?.name}>{organization?.name || 'School & College ERP'}</span>
            </div>
          </Link>
          {['WORKSPACE', 'MANAGEMENT'].map((group) => (
            <div key={group}>
              <div className="workspace-label">{group}</div>
              <nav aria-label={group} className="nav-group">
                {nav
                  .filter((n) => n.group === group && can(...n.roles))
                  .map((n) => (
                    <Link
                      href={n.href}
                      key={n.href}
                      className={`nav-item ${current?.href === n.href ? 'active' : ''}`}
                      aria-current={current?.href === n.href ? 'page' : undefined}
                    >
                      <n.icon size={19} strokeWidth={1.6} />
                      {n.label}
                    </Link>
                  ))}
              </nav>
            </div>
          ))}
          <div className="sidebar-bottom">
            <div className="help-card">
              <CircleHelp size={22} color="#7e9b82" />
              <h3>Here to help you.</h3>
              <p>Find your way around your connected campus.</p>
              <Link href="/help">
                Visit help center <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="user-block">
              <div className="avatar">{initials}</div>
              <div>
                <strong>{user.fullName}</strong>
                <span>{roles[0]?.replaceAll('_', ' ').toLowerCase()}</span>
              </div>
              <button aria-label="Sign out" title="Sign out" onClick={logout}>
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                aria-expanded={open}
                onClick={() => setOpen(true)}
              >
                <Menu size={21} />
              </button>
              <div className="breadcrumb">
                <span>Workspace</span>
                <ChevronRight size={14} />
                <strong>{current?.label || 'Help center'}</strong>
              </div>
            </div>
            <div className="topbar-right">
              <Building2 size={17} color="#91a094" />
              <select
                aria-label="Select campus"
                className="campus-select"
                value={campusId}
                onChange={(e) => {
                  localStorage.setItem('campus-id', e.target.value);
                  localStorage.removeItem('session-id');
                  window.location.reload();
                }}
              >
                {user.campuses.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="session-chip"
                aria-label="Academic session"
                value={sessionId}
                onChange={(e) => {
                  localStorage.setItem('session-id', e.target.value);
                  setSessionId(e.target.value);
                }}
              >
                {user.campuses
                  .find((c: any) => c.id === campusId)
                  ?.sessions.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <Link
                href="/notices"
                aria-label="Open notice board"
                className="icon-button notification-button"
              >
                <Bell size={20} />
              </Link>
              <div
                className="avatar"
                style={{ width: 34, height: 34, background: '#e8eee5', color: '#576e56' }}
              >
                {initials}
              </div>
            </div>
          </header>
          <main id="main-content" className="content">
            {organization?.subscription &&
              new Date(organization.subscription.currentPeriodEnd) < new Date() && (
                <div className="info-banner">
                  Your subscription has expired. Campus records remain available in read-only mode.{' '}
                  {billing ? (
                    <Link href="/subscription" className="text-green">
                      Renew subscription →
                    </Link>
                  ) : (
                    'Ask your organization owner to renew.'
                  )}
                </div>
              )}
            {error && <div className="error-banner">{error}</div>}
            {children}
            <footer className="app-footer">
              <span>
                © {new Date().getFullYear()} Campus One. Every student, a brighter future.
              </span>
              <span>
                <span className="status-dot" /> Your campus, connected.
              </span>
            </footer>
          </main>
        </div>
      </div>
    </CampusContext.Provider>
  );
}
