import Link from 'next/link';
import type { ReactNode } from 'react';

export const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || '[Company name to be confirmed]';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: '48rem', margin: '3rem auto', padding: '0 1.5rem', lineHeight: 1.65 }}>
      <Link href="/">← Campus One</Link>
      <h1>{title}</h1>
      <p>
        <strong>Draft — pending legal review. This document is not yet a final policy.</strong>
      </p>
      <p>Provider: {companyName}</p>
      {children}
      <nav aria-label="Legal pages">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{' '}
        <Link href="/refund-policy">Refund policy</Link>
      </nav>
    </main>
  );
}
