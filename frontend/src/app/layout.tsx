import type { Metadata } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import { I18nProvider } from '@/components/i18n';
export const metadata: Metadata = {
  title: { default: 'Campus One · School & College ERP', template: '%s · Campus One' },
  description:
    'One connected campus. Admissions, attendance, academics and finance for Bangladesh schools and colleges.',
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = (await cookies()).get('campus-locale')?.value === 'bn' ? 'bn' : 'en';
  return (
    <html lang={locale}>
      <body>
        <I18nProvider initialLocale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
