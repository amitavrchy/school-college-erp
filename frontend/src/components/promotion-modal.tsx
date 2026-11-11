'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCampus } from './shell';
import { Button, Modal, State } from './ui';
import { useData } from '@/lib/use-data';
import { post } from '@/lib/api';
export function PromotionModal({
  source,
  onClose,
  onSaved,
}: {
  source: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user, campusId } = useCampus();
  const sessions =
    user.campuses
      .find((c: any) => c.id === campusId)
      ?.sessions.filter((s: any) => s.id !== source.sessionId && s.status !== 'CLOSED') || [];
  const [session, setSession] = useState(sessions[0]?.id || ''),
    [target, setTarget] = useState(''),
    [carry, setCarry] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const { data: sections } = useData(session ? `sections?sessionId=${session}` : null),
    { data: roster, loading } = useData(`students?sectionId=${source.id}&limit=200`);
  const options =
    sections?.filter(
      (s: any) => s.schoolClass.numericLevel === source.schoolClass.numericLevel + 1,
    ) || [];
  useEffect(() => {
    setSelected(
      roster?.items.flatMap((s: any) =>
        s.enrollments.filter((e: any) => e.sectionId === source.id).map((e: any) => e.id),
      ) || [],
    );
  }, [roster, source.id]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('lifecycle/promote', {
        enrollmentIds: selected,
        targetSectionId: target || options[0]?.id,
        carryDues: carry,
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
    <Modal title={`Promote ${source.schoolClass.name} · ${source.name}`} onClose={onClose}>
      {!sessions.length ? (
        <div className="form-grid">
          <p>Create the next academic session and its sections before promoting students.</p>
          <Link href="/settings" className="button secondary">
            Open session settings
          </Link>
        </div>
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <label>
            Target academic session
            <select
              value={session}
              onChange={(e) => {
                setSession(e.target.value);
                setTarget('');
              }}
            >
              {sessions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Next class & section
            <select
              required
              value={target || options[0]?.id || ''}
              onChange={(e) => setTarget(e.target.value)}
            >
              {!options.length && (
                <option value="">Create a section in the next class first</option>
              )}
              {options.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.schoolClass.name} · {s.name} · {s.capacity - s._count.enrollments} seats
                  available
                </option>
              ))}
            </select>
          </label>
          <p>
            Select students to promote. Uncheck students who should be held for academic review.
          </p>
          {loading ? (
            <State loading />
          ) : (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {roster?.items.map((s: any) => {
                const id = s.enrollments.find((e: any) => e.sectionId === source.id)?.id;
                return (
                  <label
                    key={s.id}
                    style={{ flexDirection: 'row', alignItems: 'center', padding: '6px 0' }}
                  >
                    <input
                      className="checkbox"
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? [...selected, id] : selected.filter((v) => v !== id),
                        )
                      }
                    />
                    {s.fullName}
                  </label>
                );
              })}
            </div>
          )}
          <label style={{ flexDirection: 'row', alignItems: 'center' }}>
            <input
              className="checkbox"
              type="checkbox"
              checked={carry}
              onChange={(e) => setCarry(e.target.checked)}
            />
            Carry unpaid dues into the new session
          </label>
          <p>
            Without carry forward, unpaid dues block promotion. The source session must still be
            writable.
          </p>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="form-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button busy={busy} disabled={!selected.length || !options.length}>
              Promote {selected.length} students
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
