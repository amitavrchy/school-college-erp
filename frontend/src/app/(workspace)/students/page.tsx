'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  Users,
} from 'lucide-react';
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
import { csvDownload, post } from '@/lib/api';
import { useData } from '@/lib/use-data';
import { StudentImport } from '@/components/student-import';
export default function Students() {
  const { can, sessionId } = useCampus();
  const [search, setSearch] = useState(''),
    [section, setSection] = useState(''),
    [page, setPage] = useState(1),
    [add, setAdd] = useState(false),
    [importing, setImporting] = useState(false),
    [toast, setToast] = useState('');
  const { data: sections } = useData(sessionId ? `sections?sessionId=${sessionId}` : null);
  const { data, error, loading, reload } = useData(
    `students?search=${encodeURIComponent(search)}&page=${page}${section ? `&sectionId=${section}` : ''}`,
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('add')) setAdd(true);
  }, []);
  const manage = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL', 'ADMISSION_OFFICER');
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE AT THE HEART OF YOUR CAMPUS"
        title="Students"
        description="Every learner has a story. Keep theirs connected."
      >
        <Button
          variant="secondary"
          onClick={() =>
            csvDownload(
              'students',
              data?.items.map((s: any) => ({
                code: s.studentCode,
                name: s.fullName,
                class: s.enrollments[0]?.section.schoolClass.name,
                section: s.enrollments[0]?.section.name,
                guardian: s.guardians[0]?.guardian.fullName,
              })) || [],
            )
          }
        >
          <ArrowDownToLine size={16} />
          Export page
        </Button>
        {manage && (
          <Button
            variant="secondary"
            onClick={async () => {
              if (
                !window.confirm(
                  'Create app accounts for guardians whose mobile number is on the student profile, and send each an SMS invitation?',
                )
              )
                return;
              try {
                const r = await post(
                  'students/invite-guardians',
                  section ? { sectionId: section } : {},
                );
                setToast(
                  `${r.linked} students linked to guardians · ${r.accountsCreated} new accounts · ${r.invited} SMS invitations`,
                );
              } catch (e) {
                setToast((e as Error).message);
              }
            }}
          >
            Invite guardians
          </Button>
        )}
        {manage && (
          <Button variant="secondary" onClick={() => setImporting(true)}>
            <Upload size={16} />
            Import
          </Button>
        )}
        {manage && (
          <Button onClick={() => setAdd(true)}>
            <Plus size={17} />
            Add student
          </Button>
        )}
      </PageTitle>
      <Panel>
        <div className="toolbar">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search by name or student ID…"
          />
          <div className="toolbar-filters">
            <select
              aria-label="Filter by section"
              value={section}
              onChange={(e) => {
                setSection(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All classes & sections</option>
              {sections?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.schoolClass.name} · {s.name}
                </option>
              ))}
            </select>
            <span className="text-muted">{data?.total || 0} students</span>
          </div>
        </div>
        {loading || error || !data?.items.length ? (
          <State loading={loading} error={error} empty={!data?.items.length} onRetry={reload} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class & section</th>
                  <th>Roll</th>
                  <th>Guardian</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <div className="table-name">
                        <div className="avatar">
                          {s.fullName
                            .split(' ')
                            .map((v: string) => v[0])
                            .slice(0, 2)
                            .join('')}
                        </div>
                        <div>
                          <strong>{s.fullName}</strong>
                          <small>{s.studentCode}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {s.enrollments[0]
                        ? `${s.enrollments[0].section.schoolClass.name} · ${s.enrollments[0].section.name}`
                        : 'Not enrolled'}
                    </td>
                    <td>{s.enrollments[0]?.rollNumber || '—'}</td>
                    <td>
                      {s.guardians[0]?.guardian.fullName || 'Not linked'}
                      <div className="text-muted">{s.guardians[0]?.guardian.phone}</div>
                    </td>
                    <td>
                      <Badge>{s.enrollments[0]?.status || 'Not enrolled'}</Badge>
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        href={`/students/${s.id}`}
                        aria-label={`View ${s.fullName}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            Page {page} of {Math.max(1, data?.pages || 1)}
          </span>
          <div>
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="secondary"
              disabled={page >= (data?.pages || 1)}
              onClick={() => setPage(page + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Panel>
      {add && manage && (
        <FormModal
          title="Welcome a new student"
          onClose={() => setAdd(false)}
          submitLabel="Add student"
          fields={[
            { key: 'fullName', label: 'Full name' },
            { key: 'studentCode', label: 'Student ID', placeholder: 'DHM-2026-0121' },
            {
              key: 'sectionId',
              label: 'Class & section',
              options:
                sections?.map((s: any) => ({
                  value: s.id,
                  label: `${s.schoolClass.name} · ${s.name}`,
                })) || [],
            },
            { key: 'rollNumber', label: 'Roll (leave blank for the next number)', required: false },
            { key: 'dob', label: 'Date of birth', type: 'date', required: false },
            {
              key: 'gender',
              label: 'Gender',
              required: false,
              options: ['Male', 'Female', 'Other'].map((v) => ({ value: v, label: v })),
            },
            { key: 'fatherName', label: "Father's name", required: false },
            { key: 'motherName', label: "Mother's name", required: false },
            {
              key: 'guardianPhone',
              label: 'Guardian mobile',
              required: false,
              placeholder: '01XXXXXXXXX',
            },
          ]}
          onSubmit={async (v) => {
            await post('students', v);
            await reload();
            setToast('Student added to your campus');
          }}
        />
      )}
      {importing && manage && (
        <StudentImport
          sections={sections || []}
          onClose={() => setImporting(false)}
          onDone={(n) => {
            void reload();
            setToast(`${n} students imported`);
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
