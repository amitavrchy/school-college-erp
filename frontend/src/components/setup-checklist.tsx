'use client';
import Link from 'next/link';
import { useState } from 'react';
import { post } from '@/lib/api';
import { useData } from '@/lib/use-data';
import { Button, Panel } from '@/components/ui';

type Checklist = {
  dismissed: boolean;
  steps: { id: string; label: string; href: string; done: boolean }[];
};

export function SetupChecklist({ campusName }: { campusName: string }) {
  const { data, error, loading, reload } = useData<Checklist>('setup');
  const [saving, setSaving] = useState(false);
  const [dismissError, setDismissError] = useState('');
  if (loading && !data) return null;
  if (!data)
    return (
      <Panel title="School setup">
        <p>
          Could not load the checklist: {error} <button onClick={reload}>Try again</button>
        </p>
      </Panel>
    );
  if (data.dismissed) return null;
  const completed = data.steps.filter((step) => step.done).length;
  async function dismiss() {
    setSaving(true);
    setDismissError('');
    try {
      await post('setup/dismiss');
      await reload();
    } catch (e) {
      setDismissError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="setup-checklist">
      <Panel
        title="Set up your school"
        subtitle={`Getting started at ${campusName} · ${completed} of ${data.steps.length} complete`}
        action={
          <Button variant="secondary" disabled={saving} onClick={dismiss}>
            Dismiss checklist
          </Button>
        }
      >
        <progress value={completed} max={data.steps.length} aria-label="School setup progress" />
        <ul>
          {data.steps.map((step) => (
            <li key={step.id}>
              <span aria-label={step.done ? 'Complete' : 'Not complete'}>
                {step.done ? '✓' : '○'}
              </span>{' '}
              <Link href={step.href}>{step.label}</Link>
            </li>
          ))}
        </ul>
        {dismissError && <p role="alert">{dismissError}</p>}
        <p className="text-muted">
          Dismissing hides this checklist for all administrators in your institution.
        </p>
      </Panel>
    </div>
  );
}
