'use client';
import { useState } from 'react';
import { Building2, CalendarDays, LockKeyhole, Plus, ShieldCheck, Users } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, Field, FormModal, PageTitle, Panel, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { displayDate, post } from '@/lib/api';
export default function Settings() {
  const { can, campus, user } = useCampus(),
    admin = can('SUPER_ADMIN', 'CAMPUS_ADMIN'),
    academic = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL');
  const { data: users, reload } = useData(admin ? 'users' : null),
    { data: campuses, reload: reloadCampuses } = useData('campuses'),
    { data: holidays, reload: reloadHolidays } = useData('holidays');
  const [tab, setTab] = useState('Campus'),
    [modal, setModal] = useState(''),
    [toast, setToast] = useState('');
  const fields: Record<string, Field[]> = {
    user: [
      { key: 'fullName', label: 'Full name' },
      { key: 'email', label: 'Email', type: 'email' },
      { key: 'phone', label: 'Mobile number', required: false },
      { key: 'password', label: 'Initial password (at least 12 characters)', type: 'password' },
      {
        key: 'role',
        label: 'Campus role',
        options: [
          'CAMPUS_ADMIN',
          'PRINCIPAL',
          'ACCOUNTS',
          'TEACHER',
          'CLASS_TEACHER',
          'ADMISSION_OFFICER',
          'GUARDIAN',
          'STUDENT',
        ].map((r) => ({ value: r, label: r.replaceAll('_', ' ') })),
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
            {['Campus', ...(admin ? ['Users'] : []), 'Calendar', 'Account'].map((t) => (
              <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
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
                  </tr>
                ))}
              </tbody>
            </table>
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
          </div>
        )}
      </Panel>
      {modal.startsWith('activate:') ? (
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
