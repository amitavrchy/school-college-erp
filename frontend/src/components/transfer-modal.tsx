'use client';
import { useEffect, useState } from 'react';
import { api, dayKey, post } from '@/lib/api';
import { useCampus } from './shell';
import { Button, Modal } from './ui';
export function TransferModal({
  student,
  onClose,
  onSaved,
}: {
  student: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, campusId } = useCampus();
  const campuses = user.campuses.filter((c: any) => c.id !== campusId);
  const [campus, setCampus] = useState(campuses[0]?.id || ''),
    [sections, setSections] = useState<any[]>([]),
    [section, setSection] = useState(''),
    [date, setDate] = useState(dayKey()),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!campus) return;
    let active = true;
    setSections([]);
    setSection('');
    api('sections', { headers: { 'x-campus-id': campus } })
      .then((rows) => {
        if (active) setSections(rows.filter((s: any) => s.session.status !== 'CLOSED'));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [campus]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const enrollment = student.enrollments.find((e: any) => e.status === 'ACTIVE');
      await post('lifecycle/transfer', {
        enrollmentId: enrollment.id,
        targetSectionId: section,
        effectiveDate: date,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Transfer ${student.fullName}`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <p>
          Transfer preserves this campus’s history and creates an enrollment at the destination.
          Fees are prorated for the remaining days of the month.
        </p>
        <label>
          Destination campus
          <select required value={campus} onChange={(e) => setCampus(e.target.value)}>
            {!campuses.length && <option value="">No other accessible campus</option>}
            {campuses.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination class & section
          <select required value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="" disabled>
              Select destination
            </option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.schoolClass.name} · {s.name} · {s.session.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effective date
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p>
          Administrative access to both campuses is required. Any previously paid excess requires
          accounts-office reconciliation.
        </p>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!section}>
            Confirm campus transfer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
