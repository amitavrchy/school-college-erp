'use client';
import Link from 'next/link';
import { AdmissionDocuments } from '@/components/admission-documents';
import { useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, ListOrdered, Plus } from 'lucide-react';
import { useCampus } from '@/components/shell';
import {
  Badge,
  Button,
  FormModal,
  PageTitle,
  Panel,
  SearchBox,
  State,
  Toast,
} from '@/components/ui';
import { useData } from '@/lib/use-data';
import { csvDownload, post } from '@/lib/api';
export default function Admissions() {
  const { sessionId } = useCampus(),
    { data, error, loading, reload } = useData('admissions/applications'),
    { data: sections } = useData(sessionId ? `sections?sessionId=${sessionId}` : null),
    { data: classes } = useData('classes');
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [modal, setModal] = useState<any>(null),
    [toast, setToast] = useState(''),
    [documents, setDocuments] = useState('');
  const apps =
    data?.filter(
      (a: any) =>
        a.sessionId === sessionId &&
        a.applicantName.toLowerCase().includes(search.toLowerCase()) &&
        (!status || a.status === status),
    ) || [];
  async function act(path: string, body?: unknown, method = 'POST') {
    try {
      await post(path, body, method);
      await reload();
      setToast('Admission updated');
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        title="Admissions"
        eyebrow="THE START OF SOMETHING BRIGHT"
        description="From first application to a place in your community."
      >
        <Button variant="secondary" onClick={() => setModal({ type: 'merit' })}>
          <ListOrdered size={16} />
          Generate merit list
        </Button>
        <Link href="/apply" className="button primary">
          <Plus size={17} />
          New application
        </Link>
      </PageTitle>
      <div className="stats-grid">
        {[
          ['Applications', data?.length || 0],
          [
            'In review',
            data?.filter((a: any) =>
              ['SUBMITTED', 'UNDER_REVIEW', 'TEST_SCHEDULED'].includes(a.status),
            ).length || 0,
          ],
          ['Seats offered', data?.filter((a: any) => a.status === 'OFFERED').length || 0],
          ['Enrolled', data?.filter((a: any) => a.status === 'ENROLLED').length || 0],
        ].map(([l, v]) => (
          <div className="stat-card" key={l}>
            <div className="stat-top">{l}</div>
            <strong>{v}</strong>
            <div className="stat-note">Current admission pipeline</div>
          </div>
        ))}
      </div>
      <Panel>
        <div className="toolbar">
          <SearchBox value={search} onChange={setSearch} placeholder="Find an applicant…" />
          <select
            aria-label="Admission status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {[
              'SUBMITTED',
              'UNDER_REVIEW',
              'TEST_SCHEDULED',
              'MERIT_LISTED',
              'OFFERED',
              'WAITLISTED',
              'ENROLLED',
              'REJECTED',
              'EXPIRED',
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button
            variant="ghost"
            onClick={() =>
              csvDownload(
                'admissions',
                apps.map((a: any) => ({
                  name: a.applicantName,
                  class: a.applyingClass.name,
                  phone: a.guardianPhone,
                  status: a.status,
                  rank: a.meritRank,
                })),
              )
            }
          >
            <ArrowDownToLine size={16} />
            Export
          </Button>
        </div>
        {loading || error || !apps.length ? (
          <State loading={loading} error={error} empty={!apps.length} onRetry={reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Applying for</th>
                  <th>Score / GPA</th>
                  <th>Merit</th>
                  <th>Status</th>
                  <th>Next step</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.applicantName}</strong>
                      <div>{a.guardianPhone}</div>
                    </td>
                    <td>{a.applyingClass.name}</td>
                    <td>
                      {a.testScore} / {a.previousGpa}
                    </td>
                    <td>{a.meritRank ? `#${a.meritRank}` : '—'}</td>
                    <td>
                      <Badge>{a.status}</Badge>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <Button variant="ghost" onClick={() => setDocuments(a.id)}>
                          Documents
                        </Button>
                        {a.status === 'SUBMITTED' && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              act(
                                `admissions/applications/${a.id}`,
                                { status: 'UNDER_REVIEW' },
                                'PATCH',
                              )
                            }
                          >
                            Start review <ArrowUpRight size={15} />
                          </Button>
                        )}
                        {['UNDER_REVIEW', 'TEST_SCHEDULED'].includes(a.status) && (
                          <Button
                            variant="ghost"
                            onClick={() => setModal({ type: 'score', app: a })}
                          >
                            Enter scores
                          </Button>
                        )}
                        {a.status === 'MERIT_LISTED' && (
                          <>
                            <Button
                              variant="ghost"
                              onClick={() => setModal({ type: 'offer', app: a })}
                            >
                              Offer seat
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                act(
                                  `admissions/applications/${a.id}`,
                                  { status: 'WAITLISTED' },
                                  'PATCH',
                                )
                              }
                            >
                              Waitlist
                            </Button>
                          </>
                        )}
                        {a.status === 'WAITLISTED' && (
                          <Button
                            variant="ghost"
                            onClick={() => setModal({ type: 'offer', app: a })}
                          >
                            Offer seat
                          </Button>
                        )}
                        {a.status === 'OFFERED' && a.offer && (
                          <Button
                            variant="ghost"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                `${window.location.origin}/apply?offer=${a.offer.id}&token=${a.offer.acceptanceToken}`,
                              );
                              setToast('Private acceptance link copied');
                            }}
                          >
                            Copy offer link
                          </Button>
                        )}
                        {['UNDER_REVIEW', 'TEST_SCHEDULED', 'WAITLISTED'].includes(a.status) && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              act(
                                `admissions/applications/${a.id}`,
                                { status: 'REJECTED' },
                                'PATCH',
                              )
                            }
                          >
                            Reject
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {modal && (
        <FormModal
          title={
            modal.type === 'merit'
              ? 'Generate merit list'
              : modal.type === 'score'
                ? 'Admission test scores'
                : 'Offer a seat'
          }
          onClose={() => setModal(null)}
          fields={
            modal.type === 'merit'
              ? [
                  {
                    key: 'classId',
                    label: 'Class',
                    options: classes?.map((c: any) => ({ value: c.id, label: c.name })) || [],
                  },
                ]
              : modal.type === 'score'
                ? [
                    {
                      key: 'testScore',
                      label: 'Test score (out of 100)',
                      type: 'number',
                      min: 0,
                      max: 100,
                      defaultValue: modal.app.testScore,
                    },
                    {
                      key: 'previousGpa',
                      label: 'Previous GPA (out of 5)',
                      type: 'number',
                      min: 0,
                      max: 5,
                      step: '0.01',
                      defaultValue: modal.app.previousGpa,
                    },
                  ]
                : [
                    {
                      key: 'sectionId',
                      label: 'Available section',
                      options:
                        sections
                          ?.filter((s: any) => s.classId === modal.app.applyingClassId)
                          .map((s: any) => ({
                            value: s.id,
                            label: `${s.schoolClass.name} ${s.name} · ${s.capacity - s._count.enrollments} places`,
                          })) || [],
                    },
                  ]
          }
          onSubmit={async (v) => {
            await post(
              modal.type === 'merit'
                ? 'admissions/merit-lists/generate'
                : `admissions/applications/${modal.app.id}${modal.type === 'offer' ? '/offer' : ''}`,
              modal.type === 'merit' ? { ...v, sessionId } : v,
              modal.type === 'score' ? 'PATCH' : 'POST',
            );
            await reload();
            setToast('Admission updated successfully');
          }}
        />
      )}
      {documents && (
        <AdmissionDocuments applicationId={documents} onClose={() => setDocuments('')} />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
