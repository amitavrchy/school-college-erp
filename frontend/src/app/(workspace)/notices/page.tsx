'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Megaphone, Plus, Radio, Send } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, FormModal, PageTitle, Panel, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { displayDate, post } from '@/lib/api';
export default function Notices() {
  const { can, sessionId } = useCampus(),
    write = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL', 'TEACHER', 'CLASS_TEACHER'),
    admin = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL');
  const { data, error, loading, reload } = useData('notices'),
    { data: sections } = useData(write && sessionId ? `sections?sessionId=${sessionId}` : null),
    { data: sms } = useData(admin ? 'notices/sms' : null);
  const [add, setAdd] = useState(false),
    [tab, setTab] = useState('Notices'),
    [toast, setToast] = useState('');
  useEffect(() => {
    if (write && new URLSearchParams(window.location.search).has('add')) setAdd(true);
  }, [write]);
  return (
    <>
      <PageTitle
        title="Notice board"
        eyebrow="KEEP YOUR COMMUNITY IN THE LOOP"
        description="The news, reminders, and moments that bring your campus together."
      >
        {write && (
          <Button onClick={() => setAdd(true)}>
            <Plus size={16} />
            Create notice
          </Button>
        )}
      </PageTitle>
      {admin && (
        <div className="toolbar" style={{ padding: '0 0 22px' }}>
          <div className="segmented">
            {['Notices', 'SMS delivery'].map((t) => (
              <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'Notices' ? (
        loading || error || !data?.length ? (
          <Panel>
            <State loading={loading} error={error} empty={!data?.length} onRetry={reload} />
          </Panel>
        ) : (
          <div className="cards-list">
            {data.map((n: any) => (
              <Panel key={n.id} className="record-card">
                <div className="inline-actions" style={{ justifyContent: 'space-between' }}>
                  <div className="notice-symbol">
                    <Megaphone size={20} />
                  </div>
                  <Badge>{n.status}</Badge>
                </div>
                <h3>{n.title}</h3>
                <p className="notice-body">{n.body}</p>
                {n.bodyBn && (
                  <p lang="bn" className="notice-body">
                    {n.bodyBn}
                  </p>
                )}
                <div className="card-meta">
                  <span className="text-muted">{displayDate(n.scheduledAt || n.createdAt)}</span>
                  <span className="text-green">
                    {n.channels.join(' + ').replace('IN_APP', 'In-app')}
                  </span>
                </div>
                {n.status === 'DRAFT' && admin && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await post(`notices/${n.id}/schedule`);
                        await reload();
                        setToast('Notice queued for delivery');
                      } catch (e) {
                        setToast((e as Error).message);
                      }
                    }}
                  >
                    <Send size={15} />
                    Send this notice
                  </Button>
                )}
              </Panel>
            ))}
          </div>
        )
      ) : (
        <Panel
          title="SMS delivery log"
          subtitle="SIMULATED messages are stored locally; they are not sent to phones."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Message</th>
                  <th>Created</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sms?.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.toPhone}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 240, maxWidth: 480 }}>{s.body}</td>
                    <td>{displayDate(s.createdAt)}</td>
                    <td>
                      <Badge>{s.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!sms?.length && <State empty />}
          </div>
        </Panel>
      )}
      {add && (
        <FormModal
          title="Share a campus update"
          submitLabel="Save notice"
          onClose={() => setAdd(false)}
          fields={[
            { key: 'title', label: 'Notice title' },
            { key: 'body', label: 'Message in English', type: 'textarea' },
            {
              key: 'bodyBn',
              label: 'Message in Bangla (optional)',
              type: 'textarea',
              required: false,
            },
            {
              key: 'sectionId',
              label: 'Audience',
              options: [
                ...(admin ? [{ value: 'all', label: 'Entire campus' }] : []),
                ...(sections?.map((s: any) => ({
                  value: s.id,
                  label: `${s.schoolClass.name} · ${s.name}`,
                })) || []),
              ],
            },
            {
              key: 'channels',
              label: 'Delivery channels',
              options: [
                { value: 'IN_APP', label: 'In-app notice' },
                { value: 'BOTH', label: 'In-app + SMS to primary guardians' },
              ],
            },
            {
              key: 'scheduledAt',
              label: 'Schedule for (optional)',
              type: 'datetime-local',
              required: false,
            },
            {
              key: 'status',
              label: 'Publishing',
              options: [
                { value: 'SCHEDULED', label: 'Queue for delivery' },
                { value: 'DRAFT', label: 'Save as draft' },
              ],
            },
          ]}
          onSubmit={async (v) => {
            const { sectionId, channels, scheduledAt, ...rest } = v;
            await post('notices', {
              ...rest,
              sectionIds: sectionId === 'all' ? [] : [sectionId],
              channels: channels === 'BOTH' ? ['IN_APP', 'SMS'] : ['IN_APP'],
              ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
            });
            await reload();
            setToast(
              v.status === 'DRAFT'
                ? 'Draft saved'
                : 'Notice queued. Delivery starts within a minute.',
            );
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
