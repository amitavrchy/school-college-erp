'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { useData } from '@/lib/use-data';
import { bdt, post } from '@/lib/api';
import { Button, State } from '@/components/ui';
import '../landing.css';
export default function Start() {
  const { data: plans, error } = useData('saas/plans');
  const [plan, setPlan] = useState('GROWTH'),
    [period, setPeriod] = useState('MONTHLY'),
    [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (['STARTER', 'GROWTH', 'SCALE'].includes(params.get('plan') || ''))
      setPlan(params.get('plan')!);
    if (params.get('period') === 'YEARLY') setPeriod('YEARLY');
  }, []);
  const selected = plans?.find((p: any) => p.code === plan);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFailure('');
    try {
      const fd = new FormData(e.currentTarget);
      const result = await post('saas/register', {
        organizationName: name,
        slug,
        campusName: fd.get('campusName'),
        fullName: fd.get('fullName'),
        email: fd.get('email'),
        password: fd.get('password'),
        planCode: plan,
        period,
      });
      localStorage.setItem('campus-id', result.campus.id);
      localStorage.setItem('session-id', result.session.id);
      window.location.assign('/overview');
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding-page">
      <section className="onboarding-story">
        <Link href="/" className="lp-brand">
          <img src="/brand.svg" alt="" width={40} height={40} />
          <span>
            campus<span>one</span>
          </span>
        </Link>
        <div>
          <div className="lp-eyebrow">YOUR NEXT CHAPTER</div>
          <h1>
            A little less admin.
            <br />
            <em>A lot more possible.</em>
          </h1>
          <p>
            Give your institution a workspace of its own. Start with a 14-day trial and bring your
            community together, one step at a time.
          </p>
          <div className="onboarding-perks">
            {[
              'Your own organization and campus',
              'Role-based access for your people',
              'No card or payment needed to start',
            ].map((p) => (
              <span key={p}>
                <Check size={18} />
                {p}
              </span>
            ))}
          </div>
        </div>
        <span className="onboarding-foot">
          <ShieldCheck size={18} />
          Separate workspaces. Connected school days.
        </span>
      </section>
      <section className="onboarding-form">
        <Link className="text-green" href="/">
          <ChevronLeft size={15} style={{ verticalAlign: 'middle' }} /> Back to Campus One
        </Link>
        <div className="eyebrow" style={{ marginTop: 30 }}>
          LET’S MAKE ROOM FOR YOUR SCHOOL
        </div>
        <h1>Create your institution.</h1>
        <p>
          Already have an account?{' '}
          <Link href="/login" className="text-green">
            Sign in to your workspace
          </Link>
        </p>
        {error ? (
          <State error={error} />
        ) : (
          <form className="form-grid" onSubmit={submit}>
            <div className="onboarding-plan">
              <span>
                <Sparkles size={18} />
                14-day free trial
              </span>
              <select
                aria-label="Subscription plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                {plans?.map((p: any) => (
                  <option key={p.id} value={p.code}>
                    {p.name} · {bdt(p.monthlyMinor)}/month after trial
                  </option>
                ))}
              </select>
              <p>No payment is collected during your trial.</p>
            </div>
            <label>
              Institution name
              <input
                required
                minLength={3}
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, '')
                      .slice(0, 48),
                  );
                }}
                placeholder="Your school or college"
              />
            </label>
            <label>
              Institution address name
              <input
                required
                minLength={3}
                maxLength={48}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="your-school"
              />
              <span className="text-muted">
                Used to identify your institution and its public admission form.
              </span>
            </label>
            <label>
              First campus name
              <input
                name="campusName"
                minLength={3}
                maxLength={100}
                defaultValue="Main Campus"
                required
              />
            </label>
            <div className="grid-two" style={{ gap: 15 }}>
              <label>
                Your full name
                <input name="fullName" autoComplete="name" required minLength={2} />
              </label>
              <label>
                Your email
                <input name="email" type="email" autoComplete="email" required />
              </label>
            </div>
            <label>
              Create a password
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
            {failure && (
              <div className="error-banner" role="alert">
                {failure}
              </div>
            )}
            <Button busy={busy} disabled={!selected} type="submit">
              Create my workspace <ArrowRight size={18} />
            </Button>
            <p className="text-muted">
              Your trial starts on {selected?.name || 'your selected plan'}. Subscription activation
              and renewal are reviewed separately by the platform team.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
