'use client';
import { useState } from 'react';
import { Building2, CalendarDays, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react';
import { useCampus } from '@/components/shell';
import {
  Badge,
  Button,
  Field,
  FormModal,
  Modal,
  PageTitle,
  Panel,
  State,
  Toast,
} from '@/components/ui';
import { useData } from '@/lib/use-data';
import { ApiError, displayDate, post } from '@/lib/api';
const ROLE_OPTIONS = [
  'SUPER_ADMIN',
  'CAMPUS_ADMIN',
  'PRINCIPAL',
  'ACCOUNTS',
  'TEACHER',
  'CLASS_TEACHER',
  'ADMISSION_OFFICER',
  'LIBRARIAN',
  'TRANSPORT_MANAGER',
  'GUARDIAN',
  'STUDENT',
];
export default function Settings() {
  const { can, campus, user } = useCampus(),
    admin = can('SUPER_ADMIN', 'CAMPUS_ADMIN'),
    academic = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL');
  const { data: users, reload } = useData(admin ? 'users' : null),
    { data: campuses, reload: reloadCampuses } = useData('campuses'),
    { data: holidays, reload: reloadHolidays } = useData('holidays'),
    { data: policy, reload: reloadPolicy } = useData(admin ? 'settings' : null);
  const [tab, setTab] = useState('Campus'),
    [modal, setModal] = useState(''),
    [toast, setToast] = useState(''),
    [selected, setSelected] = useState<any>(null),
    [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null),
    [recovery, setRecovery] = useState<string[] | null>(null),
    [temporary, setTemporary] = useState('');
  const superAdmin = can('SUPER_ADMIN');
  const grantable = ROLE_OPTIONS.filter((r) => superAdmin || r !== 'SUPER_ADMIN');
  const fields: Record<string, Field[]> = {
    user: [
      { key: 'fullName', label: 'Full name' },
      {
        key: 'email',
        label: 'Email (guardians and students may use only a mobile number)',
        type: 'email',
        required: false,
      },
      { key: 'phone', label: 'Mobile number', required: false },
      {
        key: 'password',
        label: 'Initial password (at least 12 characters; not needed for an existing account)',
        type: 'password',
        required: false,
      },
      {
        key: 'role',
        label: 'Campus role',
        options: grantable.map((r) => ({ value: r, label: r.replaceAll('_', ' ') })),
      },
    ],
    campus: [
      { key: 'name', label: 'Campus name' },
      { key: 'code', label: 'Campus code' },
      { key: 'address', label: 'Address', required: false },
    ],
    session: [
      { key: 'name', label: 'Session name' },
      { key: 'startsOn', label: 'Starts on', type: 'date' },
      { key: 'endsOn', label: 'Ends on', type: 'date' },
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'PLANNED', label: 'Planned' },
          { value: 'ACTIVE', label: 'Active (closes current active session)' },
        ],
      },
    ],
    holiday: [
      { key: 'name', label: 'Holiday name' },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    password: [
      { key: 'currentPassword', label: 'Current password', type: 'password' },
      { key: 'password', label: 'New password (at least 12 characters)', type: 'password' },
    ],
  };
  async function submit(v: Record<string, any>) {
    if (modal === 'user') {
      try {
        const created = await post('users', v);
        await reload();
        setToast(created.attached ? 'Existing account added to this campus' : 'User added');
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 409 && /already exists/.test(e.message)))
          throw e;
        if (
          !window.confirm(`${e.message}\n\nAdd this person to your campus with the selected role?`)
        )
          return;
        await post('users', { ...v, attachExisting: true });
        await reload();
        setToast('Existing account added to this campus');
      }
      return;
    }
    await post(
      (
        {
          user: 'users',
          campus: 'campuses',
          session: 'sessions',
          holiday: 'holidays',
          password: 'auth/password',
        } as any
      )[modal],
      v,
    );
    if (modal === 'password') {
      window.location.assign('/login');
      return;
    }
    await Promise.all([reload(), reloadCampuses(), reloadHolidays()]);
    setToast('Settings saved');
    if (modal === 'campus' || modal === 'session') window.location.reload();
  }
  return (
    <>
      <PageTitle
        title="Settings"
        eyebrow="YOUR CAMPUS. YOUR WAY."
        description="The people, calendars, and details behind a well-run school."
      >
        <Button variant="secondary" onClick={() => setModal('password')}>
          <LockKeyhole size={16} />
          Change password
        </Button>
      </PageTitle>
      <Panel>
        <div className="toolbar">
          <div className="segmented">
            {['Campus', ...(admin ? ['Users', 'School policy'] : []), 'Calendar', 'Account'].map(
              (t) => (
                <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                  {t}
                </button>
              ),
            )}
          </div>
          {tab === 'Users' && admin && (
            <Button onClick={() => setModal('user')}>
              <Plus size={15} />
              Add user
            </Button>
          )}
          {tab === 'Campus' && can('SUPER_ADMIN') && (
            <Button onClick={() => setModal('campus')}>
              <Plus size={15} />
              Add campus
            </Button>
          )}
          {tab === 'Calendar' && academic && (
            <Button onClick={() => setModal('holiday')}>
              <Plus size={15} />
              Add holiday
            </Button>
          )}
        </div>
        {tab === 'Campus' ? (
          <>
            <div style={{ padding: '0 24px 24px' }}>
              <h2>{campus?.name}</h2>
              <p>{campus?.address}</p>
              <p>Campus code: {campus?.code} · Timezone: Asia/Dhaka</p>
            </div>
            <div className="panel-head">
              <h2>Academic sessions</h2>
              {admin && (
                <Button variant="secondary" onClick={() => setModal('session')}>
                  <Plus size={15} />
                  Create session
                </Button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Starts</th>
                    <th>Ends</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {campuses
                    ?.find((c: any) => c.id === campus.id)
                    ?.sessions.map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                          <div style={{ fontSize: 14, color: '#9aa69d' }}>{s.id}</div>
                        </td>
                        <td>{displayDate(s.startsOn)}</td>
                        <td>{displayDate(s.endsOn)}</td>
                        <td>
                          <Badge>{s.status}</Badge>
                        </td>
                        <td>
                          {admin && s.status === 'PLANNED' && (
                            <Button variant="ghost" onClick={() => setModal(`activate:${s.id}`)}>
                              Activate session
                            </Button>
                          )}
                          {admin && s.status !== 'CLOSED' && (
                            <Button variant="ghost" onClick={() => setModal(`close:${s.id}`)}>
                              Close session
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="info-banner" style={{ margin: 24 }}>
              Closing a session makes academic and financial records read-only. Complete promotion
              and carry forward dues first.
            </div>
          </>
        ) : tab === 'Users' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users?.map((u: any) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.fullName}</strong>
                    </td>
                    <td>{u.email}</td>
                    <td>{u.roles.map((r: any) => r.role.replaceAll('_', ' ')).join(', ')}</td>
                    <td>
                      <Badge>{u.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="row-actions">
                      {u.id !== user.id && (
                        <>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setSelected(u);
                              setModal('roles');
                            }}
                          >
                            Change role
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={async () => {
                              const verb = u.active ? 'Deactivate' : 'Reactivate';
                              if (!window.confirm(`${verb} ${u.fullName}?`)) return;
                              try {
                                await post(`users/${u.id}`, { active: !u.active }, 'PATCH');
                                await reload();
                                setToast(
                                  `${u.fullName} ${u.active ? 'deactivated' : 'reactivated'}`,
                                );
                              } catch (e) {
                                setToast((e as Error).message);
                              }
                            }}
                          >
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Create a temporary password for ${u.fullName}? Their current sessions end.`,
                                )
                              )
                                return;
                              try {
                                const r = await post(`users/${u.id}/reset-password`, {});
                                setTemporary(`${u.fullName}: ${r.temporaryPassword}`);
                              } catch (e) {
                                setToast((e as Error).message);
                              }
                            }}
                          >
                            Reset password
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'School policy' && policy ? (
          <div style={{ padding: '0 24px 24px' }}>
            <div className="panel-head" style={{ padding: '0 0 12px' }}>
              <h2>Fees, admissions and documents</h2>
              <Button variant="secondary" onClick={() => setModal('policy')}>
                Edit policy
              </Button>
            </div>
            <dl className="policy-list">
              <dt>Late fine</dt>
              <dd>
                {policy.lateFineMode === 'NONE'
                  ? 'No late fine'
                  : policy.lateFineMode === 'FLAT'
                    ? `৳${policy.lateFineFlatMinor / 100} once overdue`
                    : `৳${policy.lateFinePerDayMinor / 100} per day`}
                {policy.lateFineMode !== 'NONE' && ` · capped at ৳${policy.lateFineCapMinor / 100}`}
              </dd>
              <dt>Monthly invoices due on</dt>
              <dd>Day {policy.invoiceDueDay} of the month</dd>
              <dt>Sibling discount</dt>
              <dd>{policy.siblingDiscountBps / 100}% on fee heads marked for sibling discount</dd>
              <dt>Fee reminders by SMS</dt>
              <dd>
                {policy.feeRemindersEnabled
                  ? `On · ${policy.reminderDaysBefore} days before and on the due date`
                  : 'Off'}
              </dd>
              <dt>Seat offer validity</dt>
              <dd>{policy.admissionOfferHours} hours</dd>
              <dt>Waivers needing the Principal</dt>
              <dd>Above ৳{policy.waiverPrincipalThresholdMinor / 100}</dd>
              <dt>Name in Bangla</dt>
              <dd>{policy.institutionNameBn || '—'}</dd>
              <dt>EIIN</dt>
              <dd>{policy.eiin || '—'}</dd>
              <dt>Address and contact</dt>
              <dd>
                {[policy.address, policy.phone, policy.email].filter(Boolean).join(' · ') || '—'}
              </dd>
              <dt>Principal</dt>
              <dd>{policy.principalName || '—'}</dd>
              <dt>Receipt footer</dt>
              <dd>{policy.receiptFooter || '—'}</dd>
              <dt>Logo on receipts and report cards</dt>
              <dd>
                {policy.hasLogo ? 'Uploaded' : 'Not uploaded'}{' '}
                <label className="link-button" style={{ display: 'inline' }}>
                  {policy.hasLogo ? 'Replace' : 'Upload'} (PNG or JPEG, under 300 KB)
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const content = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
                          reader.onerror = () => reject(new Error('Could not read the file'));
                          reader.readAsDataURL(file);
                        });
                        await post('settings/logo', { mimeType: file.type, content });
                        await reloadPolicy();
                        setToast('Logo saved');
                      } catch (err) {
                        setToast((err as Error).message);
                      }
                    }}
                  />
                </label>
              </dd>
            </dl>
          </div>
        ) : tab === 'Calendar' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Holiday</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {holidays?.map((h: any) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.name}</strong>
                    </td>
                    <td>{displayDate(h.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!holidays?.length && <State empty />}
          </div>
        ) : (
          <div style={{ padding: '10px 24px 30px' }}>
            <h2>{user.fullName}</h2>
            <p>{user.email}</p>
            <p style={{ marginTop: 12 }}>
              Changing your password signs you out on every device. Your next sign-in starts a new
              secure session.
            </p>
            <Button
              variant="secondary"
              style={{ marginTop: 20 }}
              onClick={() => setModal('password')}
            >
              <LockKeyhole size={16} />
              Update password
            </Button>
            <h2 style={{ marginTop: 32 }}>Two-step sign-in</h2>
            {user.mfaEnabled ? (
              <>
                <p>
                  <Badge>On</Badge> Sign-in asks for a code from your authenticator app.
                </p>
                <Button
                  variant="secondary"
                  style={{ marginTop: 12 }}
                  onClick={() => setModal('mfa-off')}
                >
                  Turn off two-step sign-in
                </Button>
              </>
            ) : (
              <>
                <p>
                  Protect your account with a code from an authenticator app (Google Authenticator,
                  Microsoft Authenticator, 1Password and others).
                  {user.mfaSetupRequired && ' Administrators of an institution must turn this on.'}
                </p>
                <Button
                  style={{ marginTop: 12 }}
                  onClick={async () => {
                    try {
                      setSecret(await post('auth/mfa/setup', {}));
                      setModal('mfa-on');
                    } catch (e) {
                      setToast((e as Error).message);
                    }
                  }}
                >
                  <ShieldCheck size={16} />
                  Set up two-step sign-in
                </Button>
              </>
            )}
          </div>
        )}
      </Panel>
      {temporary && (
        <Modal title="Temporary password" onClose={() => setTemporary('')}>
          <p>Give this password to the person privately. They should change it after signing in.</p>
          <p className="recovery-codes" style={{ gridTemplateColumns: '1fr' }}>
            {temporary}
          </p>
        </Modal>
      )}
      {recovery && (
        <Modal title="Save your recovery codes" onClose={() => window.location.reload()}>
          <p>
            Each code works once if you lose your phone. Store them somewhere safe — they will not
            be shown again.
          </p>
          <div className="recovery-codes">
            {recovery.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </Modal>
      )}
      {modal === 'policy' && policy ? (
        <FormModal
          title="School policy"
          onClose={() => setModal('')}
          fields={[
            {
              key: 'lateFineMode',
              label: 'Late fine',
              defaultValue: policy.lateFineMode,
              options: [
                { value: 'NONE', label: 'No late fine' },
                { value: 'PER_DAY', label: 'Per day overdue' },
                { value: 'FLAT', label: 'One fixed amount once overdue' },
              ],
            },
            {
              key: 'lateFinePerDay',
              label: 'Fine per day (BDT)',
              type: 'number',
              min: 0,
              step: '0.01',
              defaultValue: policy.lateFinePerDayMinor / 100,
            },
            {
              key: 'lateFineFlat',
              label: 'Fixed fine (BDT)',
              type: 'number',
              min: 0,
              step: '0.01',
              defaultValue: policy.lateFineFlatMinor / 100,
            },
            {
              key: 'lateFineCap',
              label: 'Maximum fine per invoice (BDT)',
              type: 'number',
              min: 0,
              step: '0.01',
              defaultValue: policy.lateFineCapMinor / 100,
            },
            {
              key: 'invoiceDueDay',
              label: 'Monthly invoices due on day (1–28)',
              type: 'number',
              min: 1,
              max: 28,
              defaultValue: policy.invoiceDueDay,
            },
            {
              key: 'siblingDiscount',
              label: 'Sibling discount (%)',
              type: 'number',
              min: 0,
              max: 100,
              step: '0.01',
              defaultValue: policy.siblingDiscountBps / 100,
            },
            {
              key: 'feeRemindersEnabled',
              label: 'Fee reminders by SMS',
              defaultValue: policy.feeRemindersEnabled ? 'yes' : 'no',
              options: [
                { value: 'no', label: 'Off' },
                { value: 'yes', label: 'On' },
              ],
            },
            {
              key: 'reminderDaysBefore',
              label: 'Remind this many days before the due date',
              type: 'number',
              min: 0,
              max: 30,
              defaultValue: policy.reminderDaysBefore,
            },
            {
              key: 'admissionOfferHours',
              label: 'Seat offer validity (hours)',
              type: 'number',
              min: 1,
              max: 720,
              defaultValue: policy.admissionOfferHours,
            },
            {
              key: 'waiverThreshold',
              label: 'Waivers above this need the Principal (BDT)',
              type: 'number',
              min: 0,
              step: '0.01',
              defaultValue: policy.waiverPrincipalThresholdMinor / 100,
            },
            {
              key: 'institutionNameBn',
              label: 'Institution name in Bangla',
              required: false,
              defaultValue: policy.institutionNameBn || '',
            },
            {
              key: 'eiin',
              label: 'EIIN (6 digits)',
              required: false,
              defaultValue: policy.eiin || '',
            },
            {
              key: 'address',
              label: 'Address on documents',
              required: false,
              defaultValue: policy.address || '',
            },
            {
              key: 'phone',
              label: 'Phone on documents',
              required: false,
              defaultValue: policy.phone || '',
            },
            {
              key: 'email',
              label: 'Email on documents',
              type: 'email',
              required: false,
              defaultValue: policy.email || '',
            },
            {
              key: 'principalName',
              label: 'Principal’s name (signature line)',
              required: false,
              defaultValue: policy.principalName || '',
            },
            {
              key: 'receiptFooter',
              label: 'Receipt footer',
              required: false,
              defaultValue: policy.receiptFooter || '',
            },
          ]}
          onSubmit={async (v) => {
            const taka = (n: unknown) => Math.round(Number(n) * 100);
            await post(
              'settings',
              {
                lateFineMode: v.lateFineMode,
                lateFinePerDayMinor: taka(v.lateFinePerDay),
                lateFineFlatMinor: taka(v.lateFineFlat),
                lateFineCapMinor: taka(v.lateFineCap),
                invoiceDueDay: Number(v.invoiceDueDay),
                siblingDiscountBps: Math.round(Number(v.siblingDiscount) * 100),
                feeRemindersEnabled: v.feeRemindersEnabled === 'yes',
                reminderDaysBefore: Number(v.reminderDaysBefore),
                admissionOfferHours: Number(v.admissionOfferHours),
                waiverPrincipalThresholdMinor: taka(v.waiverThreshold),
                institutionNameBn: v.institutionNameBn || null,
                eiin: v.eiin || null,
                address: v.address || null,
                phone: v.phone || null,
                email: v.email || null,
                principalName: v.principalName || null,
                receiptFooter: v.receiptFooter || null,
              },
              'PATCH',
            );
            await reloadPolicy();
            setToast('School policy saved');
          }}
        />
      ) : modal === 'roles' && selected ? (
        <FormModal
          title={`Change role for ${selected.fullName}`}
          submitLabel="Save role"
          onClose={() => setModal('')}
          fields={[
            {
              key: 'role',
              label: 'Campus role',
              defaultValue: selected.roles[0]?.role,
              options: grantable.map((r) => ({ value: r, label: r.replaceAll('_', ' ') })),
            },
          ]}
          onSubmit={async (v) => {
            await post(`users/${selected.id}`, { roles: [v.role] }, 'PATCH');
            await reload();
            setToast('Role updated');
          }}
        />
      ) : modal === 'mfa-on' && secret ? (
        <FormModal
          title="Set up two-step sign-in"
          submitLabel="Turn on"
          onClose={() => setModal('')}
          fields={[
            {
              key: 'code',
              label: `In your authenticator app, add an account with this key: ${secret.secret} — then enter the 6-digit code it shows`,
              placeholder: '123456',
            },
          ]}
          onSubmit={async (v) => {
            const r = await post('auth/mfa/enable', { code: String(v.code).trim() });
            setRecovery(r.recoveryCodes);
          }}
        />
      ) : modal === 'mfa-off' ? (
        <FormModal
          title="Turn off two-step sign-in"
          submitLabel="Turn off"
          onClose={() => setModal('')}
          fields={[
            { key: 'password', label: 'Your password', type: 'password' },
            { key: 'code', label: 'Authentication or recovery code' },
          ]}
          onSubmit={async (v) => {
            await post('auth/mfa/disable', v);
            window.location.assign('/login');
          }}
        />
      ) : modal.startsWith('activate:') ? (
        <FormModal
          title="Activate academic session"
          submitLabel="Activate session"
          onClose={() => setModal('')}
          fields={[
            {
              key: 'confirmation',
              label: 'Type ACTIVATE to close the previous active session and start this one',
            },
          ]}
          onSubmit={async (v) => {
            if (v.confirmation !== 'ACTIVATE') throw new Error('Please type ACTIVATE to confirm');
            const sessionId = modal.slice(9);
            await post(`sessions/${sessionId}`, { status: 'ACTIVE' }, 'PATCH');
            localStorage.setItem('session-id', sessionId);
            window.location.reload();
          }}
        />
      ) : modal.startsWith('close:') ? (
        <FormModal
          title="Close academic session"
          submitLabel="Close session"
          onClose={() => setModal('')}
          fields={[{ key: 'confirmation', label: 'Type CLOSE to make this session read-only' }]}
          onSubmit={async (v) => {
            if (v.confirmation !== 'CLOSE') throw new Error('Please type CLOSE to confirm');
            await post(`sessions/${modal.slice(6)}`, { status: 'CLOSED' }, 'PATCH');
            await reloadCampuses();
            setToast('Session closed');
          }}
        />
      ) : (
        modal && (
          <FormModal
            title={
              (
                {
                  user: 'Invite a campus user',
                  campus: 'Create a campus',
                  session: 'Plan an academic session',
                  holiday: 'Add a school holiday',
                  password: 'Update your password',
                } as any
              )[modal]
            }
            fields={fields[modal]}
            onClose={() => setModal('')}
            onSubmit={submit}
          />
        )
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
