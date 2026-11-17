'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download, Plus, UserRound } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, FormModal, PageTitle, Panel, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { displayDate, pdfDownload, post } from '@/lib/api';
import { TransferModal } from '@/components/transfer-modal';
export default function StudentDetail() {
  const { id } = useParams(),
    { can } = useCampus();
  const { data: s, error, loading, reload } = useData(`students/${id}`);
  const manage = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL');
  const { data: users } = useData(can('SUPER_ADMIN', 'CAMPUS_ADMIN') ? 'users' : null);
  const [link, setLink] = useState(false),
    [transfer, setTransfer] = useState(false),
    [toast, setToast] = useState('');
  if (!s) return <State loading={loading} error={error} onRetry={reload} />;
  return (
    <>
      <PageTitle
        title={s.fullName}
        eyebrow="STUDENT PROFILE"
        description={`${s.studentCode} · A connected view of their academic journey.`}
      >
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await pdfDownload(`students/${id}/report-card`, `${s.studentCode}-report.pdf`);
            } catch (e) {
              setToast((e as Error).message);
            }
          }}
        >
          <Download size={16} />
          Report card
        </Button>
        {manage && s.enrollments.some((e: any) => e.status === 'ACTIVE') && (
          <Button variant="secondary" onClick={() => setTransfer(true)}>
            Transfer campus
          </Button>
        )}
      </PageTitle>
      <div className="grid-two">
        <Panel>
          <div className="student-overview">
            <div className="avatar">
              <UserRound size={30} />
            </div>
            <div>
              <h2>{s.fullName}</h2>
              <p>{s.studentCode}</p>
              <Badge>
                {s.enrollments.find((e: any) => e.status === 'ACTIVE')?.status ||
                  s.enrollments[0]?.status ||
                  'Not enrolled'}
              </Badge>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <tbody>
                {[
                  ['Date of birth', s.dob ? displayDate(s.dob) : 'Not provided'],
                  ['Gender', s.gender || 'Not provided'],
                  ['Blood group', s.bloodGroup || 'Not provided'],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>
                      <strong>{v}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Family connections"
          subtitle="The people supporting this learner"
          action={
            manage && can('SUPER_ADMIN', 'CAMPUS_ADMIN') ? (
              <Button variant="ghost" onClick={() => setLink(true)}>
                <Plus size={16} />
                Link guardian
              </Button>
            ) : null
          }
        >
          <div className="notice-list">
            {s.guardians.map((g: any) => (
              <div className="notice-row" key={g.guardianUserId}>
                <div className="avatar">
                  <UserRound size={18} />
                </div>
                <div>
                  <h3>{g.guardian.fullName}</h3>
                  <p>
                    {g.relation}
                    {g.isPrimary ? ' · Primary contact' : ''}
                  </p>
                  <p>
                    {g.guardian.phone} · {g.guardian.email}
                  </p>
                </div>
              </div>
            ))}
            {!s.guardians.length && <State empty />}
          </div>
        </Panel>
      </div>
      <div className="section-space">
        <Panel title="Academic journey">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Academic session</th>
                  <th>Class</th>
                  <th>Section</th>
                  <th>Roll</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {s.enrollments.map((e: any) => (
                  <tr key={e.id}>
                    <td>{e.session.name}</td>
                    <td>{e.section.schoolClass.name}</td>
                    <td>{e.section.name}</td>
                    <td>{e.rollNumber || '—'}</td>
                    <td>
                      <Badge>{e.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
      {link && (
        <FormModal
          title="Link a guardian"
          onClose={() => setLink(false)}
          fields={[
            {
              key: 'guardianUserId',
              label: 'Guardian',
              options:
                users
                  ?.filter((u: any) => u.roles.some((r: any) => r.role === 'GUARDIAN'))
                  .map((u: any) => ({ value: u.id, label: `${u.fullName} · ${u.email}` })) || [],
            },
            { key: 'relation', label: 'Relationship', defaultValue: 'Parent' },
          ]}
          onSubmit={async (v) => {
            await post(`students/${id}/guardians`, { ...v, isPrimary: s.guardians.length === 0 });
            await reload();
            setToast('Guardian linked');
          }}
        />
      )}
      {transfer && (
        <TransferModal
          student={s}
          onClose={() => setTransfer(false)}
          onSaved={() => {
            void reload();
            setToast('Campus transfer completed');
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
