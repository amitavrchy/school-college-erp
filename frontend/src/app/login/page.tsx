'use client';
import { useState } from 'react';
import { useI18n, LocaleSwitch } from '@/components/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { post } from '@/lib/api';
import { Button } from '@/components/ui';
import { CampusArt } from '@/components/campus-art';
export default function Login() {
  const { t } = useI18n();
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
        t('If an account uses this email or mobile number, a 6-digit code is on its way.') +
          (result.debugCode ? ` (${t('Test code')}: ${result.debugCode})` : ''),
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
      setInfo(t('Your password has been changed. Sign in with the new password.'));
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
        <span>{t('School & College ERP')}</span>
      </div>
    </div>
  );
  return (
    <div className="login-page">
      <section className="login-story">
        {brand}
        <div>
          <div className="eyebrow">{t('A LITTLE MORE CONNECTED. A LOT MORE POSSIBLE.')}</div>
          <h1>
            {t('A brighter campus.')}
            <br />
            {t('A better every day.')}
          </h1>
          <p>
            {t(
              'Bring your students, teachers, and families together. Everything your school needs, in one thoughtful workspace.',
            )}
          </p>
          <CampusArt className="login-illustration" />
        </div>
        <p>{t('Built for Bangladesh. Made for your community.')}</p>
      </section>
      <main className="login-form-wrap">
        <div className="login-form">
          <LocaleSwitch />
          {brand}
          <div className="eyebrow">{t('WELCOME TO YOUR WORKSPACE')}</div>
          {mode === 'mfa' ? (
            <>
              <h1>{t('Two-step sign-in')}</h1>
              <p>
                {t(
                  'Enter the 6-digit code from your authenticator app, or one of your recovery codes.',
                )}
              </p>
              <form onSubmit={verify}>
                <label>
                  {t('Authentication code')}
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
                  {t('Verify and continue')} <ArrowRight size={17} />
                </Button>
                <button type="button" className="link-button" onClick={() => setMode('login')}>
                  {t('Back to sign in')}
                </button>
              </form>
            </>
          ) : mode === 'forgot' ? (
            <>
              <h1>{t('Reset your password')}</h1>
              <p>
                {t(
                  'Enter the email or mobile number on your account. We will send a one-time code.',
                )}
              </p>
              <form onSubmit={requestReset}>
                <label>
                  {t('Email or mobile number')}
                  <input name="contact" required autoComplete="username" autoFocus />
                </label>
                {alert}
                <Button type="submit" busy={busy}>
                  {t('Send code')} <ArrowRight size={17} />
                </Button>
                <button type="button" className="link-button" onClick={() => setMode('login')}>
                  {t('Back to sign in')}
                </button>
              </form>
            </>
          ) : mode === 'reset' ? (
            <>
              <h1>{t('Choose a new password')}</h1>
              {status}
              <form onSubmit={reset}>
                <label>
                  {t('6-digit code')}
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
                  {t('New password')}
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={100}
                    required
                    placeholder={t('At least 12 characters')}
                  />
                </label>
                {alert}
                <Button type="submit" busy={busy}>
                  {t('Change password')} <ArrowRight size={17} />
                </Button>
                <button type="button" className="link-button" onClick={() => setMode('forgot')}>
                  {t('Send a new code')}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1>{t('Good to see you again.')}</h1>
              <p>{t('Sign in to keep your campus moving forward.')}</p>
              {status}
              <form onSubmit={submit}>
                <label>
                  {t('Email address')}
                  <input
                    name="email"
                    type="email"
                    placeholder="you@school.edu.bd"
                    autoComplete="username"
                    required
                  />
                </label>
                <label>
                  {t('Password')}
                  <div className="password-field">
                    <input
                      name="password"
                      type={show ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder={t('Enter your password')}
                      required
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={show ? t('Hide password') : t('Show password')}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
                {alert}
                <Button type="submit" busy={busy}>
                  {t('Sign in to Campus One')} <ArrowRight size={17} />
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
                  {t('Forgot your password?')}
                </button>
              </form>
            </>
          )}
          <p className="form-foot">
            {t('New to our campus?')} <Link href="/apply">{t('Apply for admission')}</Link>
          </p>
          <p className="form-foot">
            <ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />
            {t('Secure access for your school community')}
          </p>
        </div>
      </main>
    </div>
  );
}
