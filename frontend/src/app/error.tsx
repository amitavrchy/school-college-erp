'use client';
import { Button } from '@/components/ui';
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="empty-state">
      <h2>Let’s try that again.</h2>
      <p>This page could not load. Retry to get back to your campus.</p>
      <Button onClick={reset}>Reload this page</Button>
    </div>
  );
}
