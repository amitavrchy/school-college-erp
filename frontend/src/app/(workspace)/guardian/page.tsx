'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/i18n';
import { CalendarDays, ClipboardCheck, Download, GraduationCap, Plus, Wallet } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, FormModal, PageTitle, Panel, Stat, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { bdt, displayDate, pdfDownload, post } from '@/lib/api';
export default function Guardian() {
  const { t, locale } = useI18n();
  const localized = (value: any, field: string) =>
    (locale === 'bn' && value?.[`${field}Bn`]) || value?.[field] || '';
  const { user } = useCampus(),
    { data, error, loading, reload } = useData('guardians/me/dashboard'),
    { data: notices } = useData('notices'),
    { data: leaves, reload: reloadLeaves } = useData('leaves');
  const [selected, setSelected] = useState(''),
    [leave, setLeave] = useState(false),
    [toast, setToast] = useState('');
  const student = data?.students.find((s: any) => s.id === selected) || data?.students[0],
    enrollment =
      student?.enrollments.find((e: any) => e.status === 'ACTIVE') || student?.enrollments[0];
  const { data: results } = useData(student ? `exams/results/${student.id}` : null),
    { data: slots } = useData(enrollment ? `timetable?sectionId=${enrollment.sectionId}` : null);
  if (!data) return <State loading={loading} error={error} onRetry={reload} />;
  const attendance = enrollment?.attendance || [],
    present = attendance.filter((a: any) => ['PRESENT', 'LATE'].includes(a.status)).length,
    term = results?.flatMap((r: any) => r.terms).at(-1);
  return (
    <>
      <PageTitle
        title={`${t('Hello')}, ${user.fullName.split(' ')[0]}.`}
        eyebrow={t('A LITTLE CLOSER TO THEIR EVERY DAY')}
        description={t('Your family’s school life, connected in one place.')}
      >
        <Link href="/fees" className="button primary">
          <Wallet size={17} />
          {t('View fees & payments')}
        </Link>
      </PageTitle>
      <div className="toolbar" style={{ padding: '0 0 24px' }}>
        <div className="segmented">
          {data.students.map((s: any) => (
            <button
              key={s.id}
              className={s.id === student?.id ? 'selected' : ''}
              onClick={() => setSelected(s.id)}
            >
              {localized(s, 'fullName')}
            </button>
          ))}
        </div>
        <Button variant="secondary" disabled={!student} onClick={() => setLeave(true)}>
          <Plus size={16} />
          {t('Request leave')}
        </Button>
      </div>
      {!student ? (
        <Panel>
          <State empty />
        </Panel>
      ) : (
        <>
          <div className="welcome-banner">
            <div>
              <div className="banner-tag">
                <GraduationCap size={17} />
                {t('GROWING A LITTLE EVERY DAY')}
              </div>
              <h2>{localized(student, 'fullName')}</h2>
              <p>
                {student.studentCode} · {localized(enrollment?.section.schoolClass, 'name')} · {t('Section')}{' '}
                {localized(enrollment?.section, 'name')} · {t('Roll')} {enrollment?.rollNumber}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await pdfDownload(`students/${student.id}/report-card`, 'report-card.pdf');
                } catch (e) {
                  setToast((e as Error).message);
                }
              }}
            >
              <Download size={16} />
              {t('Report card')}
            </Button>
          </div>
          <div className="stats-grid">
            <Stat
              label={t('Recent attendance')}
              value={
                attendance.length ? `${Math.round((present / attendance.length) * 100)}%` : '—'
              }
              note={`${t('Across')} ${attendance.length} ${t('marked school days')}`}
              icon={<ClipboardCheck size={18} />}
              color="green"
            />
            <Stat
              label={t('Published GPA')}
              value={term ? term.gpa.toFixed(2) : '—'}
              note={term?.term.name || t('Results are not published yet')}
              icon={<GraduationCap size={18} />}
              color="blue"
            />
            <Stat
              label={t('Outstanding fees')}
              value={bdt(
                student.invoices.reduce(
                  (n: number, i: any) =>
                    n + Math.max(0, i.totalMinor + i.fineMinor - i.waivedMinor - i.paidMinor),
                  0,
                ),
              )}
              note={t('View invoice details in Fees')}
              icon={<Wallet size={18} />}
              color="amber"
            />
            <Stat
              label={t('School notices')}
              value={notices?.length || 0}
              note={t('Updates for your family')}
              icon={<CalendarDays size={18} />}
              color="purple"
            />
          </div>
          <div className="grid-two">
            <Panel title={t('Recent attendance')} subtitle={t('A window into their school days')}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Date')}</th>
                      <th>{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.slice(0, 7).map((a: any) => (
                      <tr key={a.id}>
                        <td>{displayDate(a.date)}</td>
                        <td>
                          <Badge tone={statusTone(a.status)}>{localizeStatus(a.status, t)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!attendance.length && <State empty />}
              </div>
            </Panel>
            <Panel
              title={t('Family notice board')}
              action={
                <Link href="/notices" className="button ghost">
                  {t('View all')}
                </Link>
              }
            >
              <div className="notice-list">
                {notices?.slice(0, 3).map((n: any) => (
                  <div key={n.id} className="notice-row">
                    <div>
                      <h3>{localized(n, 'title')}</h3>
                      <p>{localized(n, 'body')}</p>
                      <time>{displayDate(n.createdAt)}</time>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="section-space">
            <Panel title={t('Weekly timetable')}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Day')}</th>
                      <th>{t('Period')}</th>
                      <th>{t('Subject')}</th>
                      <th>{t('Room')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots?.map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          {
                            [
                              t('Sunday'),
                              t('Monday'),
                              t('Tuesday'),
                              t('Wednesday'),
                              t('Thursday'),
                              t('Friday'),
                              t('Saturday'),
                            ][s.dayOfWeek]
                          }
                        </td>
                        <td>{s.period}</td>
                        <td>
                          <strong>{localized(s.subject, 'name')}</strong>
                        </td>
                        <td>{s.room}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!slots?.length && <State empty />}
              </div>
            </Panel>
          </div>
          <div className="section-space">
            <Panel title={t('Leave requests')}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t('From')}</th>
                      <th>{t('To')}</th>
                      <th>{t('Reason')}</th>
                      <th>{t('Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves
                      ?.filter((l: any) => l.studentId === student.id)
                      .map((l: any) => (
                        <tr key={l.id}>
                          <td>{displayDate(l.fromDate)}</td>
                          <td>{displayDate(l.toDate)}</td>
                          <td>{l.reason}</td>
                          <td>
                            <Badge tone={statusTone(l.status)}>{localizeStatus(l.status, t)}</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      )}
      {leave && (
        <FormModal
          title={`${t('Request leave for')} ${localized(student, 'fullName')}`}
          submitLabel={t('Request leave')}
          onClose={() => setLeave(false)}
          fields={[
            { key: 'fromDate', label: t('From date'), type: 'date' },
            { key: 'toDate', label: t('To date'), type: 'date' },
            { key: 'reason', label: t('Reason for leave'), type: 'textarea' },
          ]}
          onSubmit={async (v) => {
            await post('leaves', { ...v, studentId: student.id });
            await reloadLeaves();
            setToast(t('Leave request submitted to your school'));
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}

function localizeStatus(status: string, t: ReturnType<typeof useI18n>['t']) {
  const known = ['PRESENT', 'LATE', 'ABSENT', 'APPROVED', 'REJECTED', 'PENDING'] as const;
  const key = known.find((value) => value === status);
  return key ? t(key) : status;
}

function statusTone(status: string) {
  if (['PRESENT', 'APPROVED'].includes(status)) return 'green';
  if (['ABSENT', 'REJECTED'].includes(status)) return 'red';
  if (status === 'LATE') return 'amber';
  return 'blue';
}
