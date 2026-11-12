import type { Metadata } from 'next';
import Landing from '@/components/landing';
export const metadata: Metadata = {
  title: 'Campus One — School & College Management for Bangladesh',
  description:
    'A connected school and college platform for Bangladesh. Manage academics, finance, library, transport and family communication in your own institutional workspace.',
};
export default function Home() {
  return <Landing />;
}
