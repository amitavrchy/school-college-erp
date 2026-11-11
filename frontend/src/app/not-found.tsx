import Link from 'next/link';
export default function NotFound(){return <main className="empty-state" style={{minHeight:'100vh'}}><img src="/brand.svg" width={56} height={56} alt="Campus One"/><h1>A little off the timetable.</h1><p>We couldn’t find this page. Your campus is one click away.</p><Link href="/" className="button primary">Back to campus</Link></main>;}
