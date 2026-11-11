'use client';
import { useState } from 'react';
import { BookOpen, CalendarDays, Plus } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, Field, FormModal, PageTitle, Panel, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { post } from '@/lib/api';
export default function Academics() {
  const { can, sessionId } = useCampus();
  const manage = can('SUPER_ADMIN', 'CAMPUS_ADMIN', 'PRINCIPAL'),
    admin = can('SUPER_ADMIN', 'CAMPUS_ADMIN');
  const {
      data: sections,
      error,
      loading,
      reload,
    } = useData(sessionId ? `sections?sessionId=${sessionId}` : null),
    { data: classes, reload: reloadClasses } = useData('classes'),
    { data: subjects, reload: reloadSubjects } = useData('subjects'),
    { data: teachers } = useData('teachers');
  const [tab, setTab] = useState('Sections'),
    [sectionId, setSection] = useState(''),
    [modal, setModal] = useState(''),
    [toast, setToast] = useState('');
  const selected = sections?.find((s: any) => s.id === sectionId) || sections?.[0];
  const { data: slots, reload: reloadSlots } = useData(
    selected ? `timetable?sectionId=${selected.id}` : null,
  );
  const { data: roster } = useData(
    modal === 'promote' && selected ? `students?sectionId=${selected.id}&limit=200` : null,
  );
  const sectionOptions =
      sections?.map((s: any) => ({ value: s.id, label: `${s.schoolClass.name} · ${s.name}` })) ||
      [],
    subjectOptions = subjects?.map((s: any) => ({ value: s.id, label: s.name })) || [],
    teacherOptions = teachers?.map((u: any) => ({ value: u.id, label: u.fullName })) || [];
  const fields: Record<string, Field[]> = {
    section: [
      {
        key: 'classId',
        label: 'Class',
        options: classes?.map((c: any) => ({ value: c.id, label: c.name })) || [],
      },
      { key: 'name', label: 'Section name' },
      {
        key: 'capacity',
        label: 'Seat capacity',
        type: 'number',
        min: 1,
        max: 200,
        defaultValue: 40,
      },
      {
        key: 'shift',
        label: 'Shift',
        options: [
          { value: 'MORNING', label: 'Morning' },
          { value: 'DAY', label: 'Day' },
        ],
      },
      { key: 'classTeacherId', label: 'Class teacher', options: teacherOptions, required: false },
    ],
    class: [
      { key: 'name', label: 'Class name' },
      { key: 'numericLevel', label: 'Class level', type: 'number', min: 1, max: 12 },
    ],
    subject: [
      { key: 'name', label: 'Subject name' },
      { key: 'code', label: 'Subject code' },
    ],
    assignment: [
      { key: 'sectionId', label: 'Section', options: sectionOptions },
      { key: 'subjectId', label: 'Subject', options: subjectOptions },
      { key: 'teacherId', label: 'Teacher', options: teacherOptions },
    ],
    slot: [
      { key: 'subjectId', label: 'Subject', options: subjectOptions },
      { key: 'teacherId', label: 'Teacher', options: teacherOptions },
      {
        key: 'dayOfWeek',
        label: 'Day',
        options: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
          (label, i) => ({ value: String(i), label }),
        ),
      },
      { key: 'period', label: 'Period', type: 'number', min: 1, max: 12 },
      { key: 'room', label: 'Room' },
    ],
    promote: [
      {
        key: 'targetSectionId',
        label: 'Target section (new session)',
        placeholder: 'Section ID from the target academic session',
      },
      {
        key: 'carryDues',
        label: 'Unpaid dues policy',
        options: [
          { value: 'false', label: 'Block if unpaid dues exist' },
          { value: 'true', label: 'Carry dues to the next session' },
        ],
      },
    ],
  };
  async function submit(v: Record<string, any>) {
    if (modal === 'promote') {
      await post('lifecycle/promote', {
        ...v,
        carryDues: v.carryDues === 'true',
        enrollmentIds: roster?.items.flatMap((s: any) =>
          s.enrollments.filter((e: any) => e.sectionId === selected.id).map((e: any) => e.id),
        ),
      });
    } else
      await post(
        (
          {
            section: 'sections',
            class: 'classes',
            subject: 'subjects',
            assignment: 'assignments',
            slot: 'timetable',
          } as any
        )[modal],
        {
          ...v,
          ...(modal === 'section' ? { sessionId } : {}),
          ...(modal === 'slot' ? { sectionId: selected.id, dayOfWeek: Number(v.dayOfWeek) } : {}),
        },
      );
    await Promise.all([reload(), reloadClasses(), reloadSubjects(), reloadSlots()]);
    setToast('Academic records updated');
  }
  return (
    <>
      <PageTitle
        title="Academics"
        eyebrow="MAKE ROOM FOR GREAT LEARNING"
        description="Classes, people, and plans that bring your school day together."
      >
        {manage && (
          <Button variant="secondary" onClick={() => setModal('assignment')}>
            Assign teacher
          </Button>
        )}
        {admin && (
          <Button onClick={() => setModal(tab === 'Subjects' ? 'subject' : 'section')}>
            <Plus size={16} />
            Add {tab === 'Subjects' ? 'subject' : 'section'}
          </Button>
        )}
      </PageTitle>
      <Panel>
        <div className="toolbar">
          <div className="segmented">
            {['Sections', 'Subjects', 'Timetable'].map((t) => (
              <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
          {admin && (
            <Button variant="ghost" onClick={() => setModal('class')}>
              <Plus size={15} />
              Add class
            </Button>
          )}
        </div>
        {tab === 'Sections' ? (
          loading || error ? (
            <State loading={loading} error={error} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class & section</th>
                    <th>Academic session</th>
                    <th>Shift</th>
                    <th>Students / capacity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sections?.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <strong>
                          {s.schoolClass.name} · {s.name}
                        </strong>
                      </td>
                      <td>{s.session.name}</td>
                      <td>{s.shift.toLowerCase()}</td>
                      <td>
                        {s._count.enrollments} / {s.capacity}
                      </td>
                      <td>
                        <Badge>{s.session.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'Subjects' ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>Grading requirement</th>
                </tr>
              </thead>
              <tbody>
                {subjects?.map((s: any) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.code}</td>
                    <td>{s.compulsory ? 'Compulsory' : 'Optional'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <select
                aria-label="Timetable section"
                value={selected?.id || ''}
                onChange={(e) => setSection(e.target.value)}
              >
                {sectionOptions.map((o: any) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {manage && (
                <Button variant="secondary" onClick={() => setModal('slot')}>
                  <Plus size={15} />
                  Add period
                </Button>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Period</th>
                    <th>Subject</th>
                    <th>Room</th>
                  </tr>
                </thead>
                <tbody>
                  {slots?.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        {
                          [
                            'Sunday',
                            'Monday',
                            'Tuesday',
                            'Wednesday',
                            'Thursday',
                            'Friday',
                            'Saturday',
                          ][s.dayOfWeek]
                        }
                      </td>
                      <td>{s.period}</td>
                      <td>
                        <strong>{s.subject.name}</strong>
                      </td>
                      <td>{s.room}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!slots?.length && <State empty />}
            </div>
          </>
        )}
      </Panel>
      {manage && (
        <div className="section-space">
          <Panel
            title="Session promotion"
            subtitle="Move an entire section to the next class. Run promotion before closing the source session."
          >
            <div className="toolbar">
              <select
                aria-label="Promotion source section"
                value={selected?.id || ''}
                onChange={(e) => setSection(e.target.value)}
              >
                {sectionOptions.map((o: any) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={() => setModal('promote')}>
                Promote this section
              </Button>
            </div>
          </Panel>
        </div>
      )}
      {modal && (
        <FormModal
          title={
            (
              {
                section: 'Create a section',
                class: 'Create a class',
                subject: 'Add a subject',
                assignment: 'Assign a subject teacher',
                slot: 'Plan a timetable period',
                promote: 'Promote section students',
              } as any
            )[modal]
          }
          fields={fields[modal]}
          onClose={() => setModal('')}
          onSubmit={submit}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
