'use client';
import { useState } from 'react';
import { CreditCard, Download, Plus, ShieldCheck } from 'lucide-react';
import { useCampus } from '@/components/shell';
import { Badge, Button, FormModal, PageTitle, Panel, Stat, State, Toast } from '@/components/ui';
import { useData } from '@/lib/use-data';
import { bdt, displayDate, pdfDownload, post } from '@/lib/api';
export default function Subscription() {
  const { billing } = useCampus();
  const { data, error, loading, reload } = useData(billing ? 'saas/me' : null),
    { data: plans } = useData('saas/plans');
  const [request, setRequest] = useState(false),
    [brand, setBrand] = useState(false),
    [toast, setToast] = useState('');
  if (!billing)
    return (
      <Panel>
        <State error="Only your organization owner or billing administrator can manage the subscription." />
      </Panel>
    );
  if (!data) return <State loading={loading} error={error} onRetry={reload} />;
  const sub = data.organization.subscription,
    plan = sub?.plan,
    settings = data.paymentSettings,
    methods = [
      ...(settings?.bkashNumber
        ? [{ value: 'BKASH', label: `bKash · ${settings.bkashNumber}` }]
        : []),
      ...(settings?.nagadNumber
        ? [{ value: 'NAGAD', label: `Nagad · ${settings.nagadNumber}` }]
        : []),
      ...(settings?.bankInstructions ? [{ value: 'BANK', label: 'Bank transfer' }] : []),
    ];
  const expired = !sub || new Date(sub.currentPeriodEnd) < new Date();
  return (
    <>
      <PageTitle
        title="Your institution. Your plan."
        eyebrow="SUBSCRIPTION & BILLING"
        description="One subscription covers the campuses and people in your organization."
      >
        <Button variant="secondary" onClick={() => setBrand(true)}>
          Institution profile
        </Button>
        <Button onClick={() => setRequest(true)} disabled={!methods.length}>
          <Plus size={16} />
          Submit transaction
        </Button>
      </PageTitle>
      <div className="stats-grid">
        <Stat
          label="Current plan"
          value={plan?.name || 'No plan'}
          note={sub?.period?.toLowerCase() || 'Choose a subscription'}
          icon={<CreditCard size={18} />}
          color="blue"
        />
        <Stat
          label="Subscription"
          value={expired ? 'Expired' : sub.status.toLowerCase()}
          note={
            sub ? `Valid until ${displayDate(sub.currentPeriodEnd)}` : 'Contact the platform team'
          }
          icon={<ShieldCheck size={18} />}
          color="green"
        />
        <Stat
          label="Student records"
          value={`${data.usage.students} / ${plan?.maxStudents || 0}`}
          note="Across all your campuses"
          icon={<CreditCard size={18} />}
          color="amber"
        />
        <Stat
          label="Campuses"
          value={`${data.usage.campuses} / ${plan?.maxCampuses || 0}`}
          note={`${data.usage.staff} of ${plan?.maxStaff || 0} staff accounts`}
          icon={<ShieldCheck size={18} />}
          color="purple"
        />
      </div>
      <div className="grid-two">
        <Panel title="Pay your way" subtitle="A reference is reviewed before activation.">
          <div className="subscription-instructions">
            {methods.length ? (
              <>
                {settings?.bkashNumber && (
                  <div>
                    <Badge>bKash</Badge>
                    <strong>{settings.bkashNumber}</strong>
                  </div>
                )}
                {settings?.nagadNumber && (
                  <div>
                    <Badge>Nagad</Badge>
                    <strong>{settings.nagadNumber}</strong>
                  </div>
                )}
                {settings?.bankInstructions && (
                  <p style={{ whiteSpace: 'pre-wrap' }}>{settings.bankInstructions}</p>
                )}
                <p>{settings?.paymentInstructions}</p>
              </>
            ) : (
              <p>
                Receiving accounts have not been configured. Ask your platform administrator to set
                them up or activate your subscription manually.
              </p>
            )}
            {settings?.supportEmail && (
              <a className="text-green" href={`mailto:${settings.supportEmail}`}>
                {settings.supportEmail}
              </a>
            )}
          </div>
        </Panel>
        <Panel title="Your workspace capacity" subtitle="Limits apply to the whole institution.">
          <div className="usage-list">
            {[
              ['Students', data.usage.students, plan?.maxStudents],
              ['Campuses', data.usage.campuses, plan?.maxCampuses],
              ['Staff accounts', data.usage.staff, plan?.maxStaff],
            ].map(([label, used, max]: any) => (
              <div key={label}>
                <div>
                  <span>{label}</span>
                  <strong>
                    {used} / {max}
                  </strong>
                </div>
                <div className="usage-track">
                  <span style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
                </div>
              </div>
            ))}
            <p>
              {(data.usage.documentBytes / 1024 / 1024).toFixed(1)} MB of encrypted admission
              documents
            </p>
          </div>
        </Panel>
      </div>
      <div className="section-space">
        <Panel
          title="Plans with room to grow"
          subtitle="An approved renewal extends your current paid term; plan changes take effect immediately."
        >
          <div className="subscription-plan-grid">
            {plans?.map((p: any) => (
              <div key={p.id} className={`subscription-plan ${p.id === plan?.id ? 'current' : ''}`}>
                <h3>{p.name}</h3>
                <strong>
                  {bdt(p.monthlyMinor)} <span>/ month</span>
                </strong>
                <p>
                  {p.maxCampuses} campuses · {p.maxStudents} student records · {p.maxStaff} staff
                </p>
                <p>{p.features.join(' · ')}</p>
                <Badge>{p.id === plan?.id ? 'Your plan' : `${bdt(p.annualMinor)} / year`}</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="section-space">
        <Panel
          title="Transaction submissions"
          subtitle="Track review status and download approved receipts."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Plan</th>
                  <th>Method / reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Review</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{displayDate(p.createdAt)}</td>
                    <td>
                      {p.plan.name}
                      <div>{p.period.toLowerCase()}</div>
                    </td>
                    <td>
                      <strong>{p.method}</strong>
                      <div>{p.reference}</div>
                    </td>
                    <td>{bdt(p.amountMinor)}</td>
                    <td>
                      <Badge>{p.status}</Badge>
                    </td>
                    <td style={{ maxWidth: 260, whiteSpace: 'normal' }}>
                      {p.reviewNote || 'Awaiting platform review'}
                    </td>
                    <td>
                      {p.status === 'APPROVED' && (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await pdfDownload(
                                `saas/payments/${p.id}/receipt`,
                                'subscription-receipt.pdf',
                              );
                            } catch (e) {
                              setToast((e as Error).message);
                            }
                          }}
                        >
                          <Download size={16} />
                          Receipt
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.payments.length && <State empty />}
          </div>
        </Panel>
      </div>
      {request && (
        <FormModal
          title="Submit a subscription payment"
          submitLabel="Send for manual review"
          onClose={() => setRequest(false)}
          fields={[
            {
              key: 'planId',
              label: 'Plan',
              options:
                plans?.map((p: any) => ({
                  value: p.id,
                  label: `${p.name} · ${bdt(p.monthlyMinor)}/month · ${bdt(p.annualMinor)}/year`,
                })) || [],
              defaultValue: plan?.id,
            },
            {
              key: 'period',
              label: 'Billing period',
              options: [
                { value: 'MONTHLY', label: 'One month' },
                { value: 'YEARLY', label: 'One year' },
              ],
            },
            { key: 'method', label: 'Paid using', options: methods },
            {
              key: 'senderPhone',
              label: 'Sender mobile number',
              type: 'tel',
              placeholder: '01XXXXXXXXX',
            },
            {
              key: 'reference',
              label: 'Transaction reference',
              placeholder: 'Copy the reference from your payment receipt',
            },
          ]}
          onSubmit={async (v) => {
            await post('saas/payment-requests', v);
            await reload();
            setToast('Submitted for review. Your plan changes after approval.');
          }}
        />
      )}
      {brand && (
        <FormModal
          title="Institution profile"
          onClose={() => setBrand(false)}
          fields={[
            { key: 'name', label: 'Institution name', defaultValue: data.organization.name },
            {
              key: 'supportEmail',
              label: 'School support email',
              type: 'email',
              required: false,
              defaultValue: data.organization.supportEmail || '',
            },
            {
              key: 'accentColor',
              label: 'Brand accent color',
              type: 'color',
              defaultValue: data.organization.accentColor,
            },
          ]}
          onSubmit={async (v) => {
            await post('saas/organization', v, 'PATCH');
            await reload();
            setToast('Institution profile updated');
          }}
        />
      )}
      <Toast message={toast} clear={() => setToast('')} />
    </>
  );
}
