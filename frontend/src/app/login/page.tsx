'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { post } from '@/lib/api';
import { Button } from '@/components/ui';
import { CampusArt } from '@/components/campus-art';
export default function Login() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [show, setShow] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      localStorage.removeItem('campus-id');
      const result = await post('auth/login', {
        email: fd.get('email'),
        password: fd.get('password'),
      });
      router.replace(result.platformAdmin ? '/platform' : '/overview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const brand = (
    <div className="brand">
      <img src="/brand.svg" alt="" />
      <div>
        <strong>campusone</strong>
        <span>School & College ERP</span>
      </div>
    </div>
  );
  return (
    <div className="login-page">
      <section className="login-story">
        {brand}
        <div>
          <div className="eyebrow">A LITTLE MORE CONNECTED. A LOT MORE POSSIBLE.</div>
          <h1>
            A brighter campus.
            <br />A better every day.
          </h1>
          <p>
            Bring your students, teachers, and families together. Everything your school needs, in
            one thoughtful workspace.
          </p>
          <CampusArt className="login-illustration" />
        </div>
        <p>Built for Bangladesh. Made for your community.</p>
      </section>
      <main className="login-form-wrap">
        <div className="login-form">
          {brand}
          <div className="eyebrow">WELCOME TO YOUR WORKSPACE</div>
          <h1>Good to see you again.</h1>
          <p>Sign in to keep your campus moving forward.</p>
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                placeholder="you@school.edu.bd"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? 'Hide password' : 'Show password'}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div role="alert" className="error-banner">
                {error}
              </div>
            )}
            <Button type="submit" busy={busy}>
              Sign in to Campus One <ArrowRight size={17} />
            </Button>
          </form>
          <p className="form-foot">
            New to our campus? <Link href="/apply">Apply for admission</Link>
          </p>
          <p className="form-foot">
            <ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            Secure access for your school community
          </p>
        </div>
      </main>
    </div>
  );
}
