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
    [info, setInfo] = useState(''),
    [show, setShow] = useState(false),
    [mode, setMode] = useState<'login' | 'mfa' | 'forgot' | 'reset'>('login'),
    [challenge, setChallenge] = useState(''),
    [contact, setContact] = useState('');
  const router = useRouter();
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const enter = (result: { platformAdmin?: boolean }) =>
    router.replace(result.platformAdmin ? '/platform' : '/overview');
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    return run(async () => {
      localStorage.removeItem('campus-id');
      const result = await post('auth/login', {
        email: fd.get('email'),
        password: fd.get('password'),
      });
      if (result.mfaRequired) {
        setChallenge(result.challenge);
        setInfo('');
        setMode('mfa');
        return;
      }
      enter(result);
    });
  }
  function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    return run(async () => {
      enter(await post('auth/mfa/login', { challenge, code: String(fd.get('code') || '').trim() }));
    });
  }
  function requestReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get('contact') || '').trim();
    return run(async () => {
      const result = await post('auth/codes', { purpose: 'PASSWORD_RESET', contact: value });
      setContact(value);
      setInfo(
        'If an account uses this email or mobile number, a 6-digit code is on its way.' +
          (result.debugCode ? ` (Test code: ${result.debugCode})` : ''),
      );
      setMode('reset');
    });
  }
  function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    return run(async () => {
      await post('auth/password-reset', {
        contact,
        code: fd.get('code'),
        password: fd.get('password'),
      });
      setInfo('Your password has been changed. Sign in with the new password.');
      setMode('login');
    });
  }
  const alert = error && (
    <div role="alert" className="error-banner">
      {error}
    </div>
  );
  const status = info && (
    <p role="status" className="text-muted">
      {info}
    </p>
  );
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
          {mode === 'mfa' ? (
            <>
              <h1>Two-step sign-in</h1>
              <p>
                Enter the 6-digit code from your authenticator app, or one of your recovery codes.
              </p>
              <form onSubmit={verify}>
                <label>
                  Authentication code
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    inputMode="text"
                    required
                    minLength={6}
                    maxLength={20}
                    autoFocus
                  />
                </label>
                {alert}
                <Button type="submit" busy={busy}>
                  Verify and continue <ArrowRight size={17} />
                </Button>
                <button type="button" className="link-button" onClick={() => setMode('login')}>
                  Back to sign in
                </button>
              </form>
            </>
          ) : mode === 'forgot' ? (
            <>
              <h1>Reset your password</h1>
              <p>Enter the email or mobile number on your account. We will send a one-time code.</p>
              <form onSubmit={requestReset}>
                <label>
                  Email or mobile number
                  <input name="contact" required autoComplete="username" autoFocus />
                </label>
                {alert}
                <Button type="submit" busy={busy}>
                  Send code <ArrowRight size={17} />
                </Button>
                <button type="button" className="link-button" onClick={() => setMode('login')}>
                  Back to sign in
                </button>
              </form>
            </>
          ) : mode === 'reset' ? (
            <>
              <h1>Choose a new password</h1>
              {status}
              <form onSubmit={reset}>
                <label>
                  6-digit code
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={100}
                    required
                    placeholder="At least 12 characters"
                  />
                </label>
                {alert}
                <Button type="submit" busy={busy}>
                  Change password <ArrowRight size={17} />
                </Button>
                <button type="button" className="link-button" onClick={() => setMode('forgot')}>
                  Send a new code
                </button>
              </form>
            </>
          ) : (
            <>
              <h1>Good to see you again.</h1>
              <p>Sign in to keep your campus moving forward.</p>
              {status}
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
                {alert}
                <Button type="submit" busy={busy}>
                  Sign in to Campus One <ArrowRight size={17} />
                </Button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setError('');
                    setInfo('');
                    setMode('forgot');
                  }}
                >
                  Forgot your password?
                </button>
              </form>
            </>
          )}
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
