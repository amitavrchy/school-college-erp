import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Campus One · School & College ERP', template: '%s · Campus One' },
  description:
    'One connected campus. Admissions, attendance, academics and finance for Bangladesh schools and colleges.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
