'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useI18n, LocaleSwitch } from '@/components/i18n';
import { ArrowRight, CheckCircle2, GraduationCap } from 'lucide-react';
import { AdmissionUpload } from '@/components/admission-documents';
import { Button, State } from '@/components/ui';
import { post } from '@/lib/api';
import { useData } from '@/lib/use-data';
export default function Apply() {
  const { t } = useI18n();
  const school =
    typeof window === 'undefined'
      ? 'scholars'
      : new URLSearchParams(window.location.search).get('school') || 'scholars';
  const {
    data: campuses,
    error,
    loading,
  } = useData(`admissions/options?school=${encodeURIComponent(school)}`);
  const [campusId, setCampus] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(''),
    [application, setApplication] = useState<any>(null);
  const campus = campuses?.find((c: any) => c.id === campusId) || campuses?.[0];
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null,
    offer = params?.get('offer'),
    token = params?.get('token');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      const fd = new FormData(e.currentTarget);
      const v = Object.fromEntries(fd);
      if (!v.guardianEmail) delete v.guardianEmail;
      const a = await post('admissions/applications', v);
      setApplication(a);
      setMessage(`${t('Your application has been received. Keep your reference:')} ${a.id}`);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    setBusy(true);
    setFailure('');
    try {
      await post(`admissions/offers/${offer}/accept`, { token });
      setMessage(
        t(
          'Your seat is confirmed. Please contact the admissions office to arrange your admission fee and guardian account.',
        ),
      );
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="public-form">
      <LocaleSwitch />
      <Link href="/login" className="brand">
        <img src="/brand.svg" alt="" />
        <div>
          <strong>campusone</strong>
          <span>{t('School & College ERP')}</span>
        </div>
      </Link>
      <div className="eyebrow">{t('YOUR NEXT CHAPTER STARTS HERE')}</div>
      <h1>{offer ? t('A place in our community.') : t('A brighter future begins here.')}</h1>
      <p style={{ marginTop: 10 }}>
        {offer
          ? t('Accept your private seat offer to confirm enrollment.')
          : t('Apply to Scholars School & College. We can’t wait to meet you.')}
      </p>
      {message ? (
        <div className="empty-state">
          <CheckCircle2 size={40} />
          <h2>{t('Welcome aboard.')}</h2>
          <p>{message}</p>
          {application && (
            <AdmissionUpload applicationId={application.id} token={application.uploadToken} />
          )}
          <Link href="/login" className="button secondary">
            {t('Back to sign in')}
          </Link>
        </div>
      ) : offer ? (
        <div className="form-grid">
          <div className="info-banner">
            {t(
              'Accepting confirms your enrollment and creates an admission fee invoice. Payment is arranged with the accounts office.',
            )}
          </div>
          {failure && (
            <div role="alert" className="error-banner">
              {failure}
            </div>
          )}
          <Button busy={busy} onClick={accept}>
            {t('Accept my seat')} <ArrowRight size={17} />
          </Button>
        </div>
      ) : loading || error ? (
        <State loading={loading} error={error} />
      ) : (
        <form className="form-grid" onSubmit={submit}>
          <label>
            {t('Campus')}
            <select value={campus?.id || ''} onChange={(e) => setCampus(e.target.value)}>
              {campuses?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Academic session')}
            <select name="sessionId" required key={campus?.id}>
              {campus?.sessions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Applying for')}
            <select name="applyingClassId" required key={`class-${campus?.id}`}>
              {campus?.classes.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Student’s full name')}
            <input
              name="applicantName"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <label>
            {t('Guardian’s mobile number')}
            <input
              name="guardianPhone"
              type="tel"
              placeholder="01XXXXXXXXX"
              pattern="(\+?88)?01[3-9][0-9]{8}"
              required
            />
          </label>
          <label>
            {t('Guardian’s email (optional)')}
            <input name="guardianEmail" type="email" />
          </label>
          {failure && (
            <div role="alert" className="error-banner">
              {failure}
            </div>
          )}
          <Button type="submit" busy={busy} disabled={!campus?.sessions.length}>
            {t('Submit application')} <ArrowRight size={16} />
          </Button>
          <Link href="/login" className="text-green">
            {t('Already part of our community? Sign in')}
          </Link>
        </form>
      )}
    </main>
  );
}
