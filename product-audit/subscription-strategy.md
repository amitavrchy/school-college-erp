# School & College ERP — Subscription Strategy

Prices are **hypotheses in BDT** unless stated as "in code".

## 1. What exists in code

| Element | Implementation |
|---|---|
| Plans (in code, `saas/policy.ts:3-40`) | **Starter** BDT 2,500/month or 25,000/year — 1 campus, 500 students, 30 staff, features homework + support. **Growth** BDT 6,500/month or 65,000/year — 3 campuses, 2,000 students, 150 staff, + library, transport. **Scale** BDT 15,000/month or 150,000/year — 20 campuses, 10,000 students, 1,000 staff, same features |
| Trial | 14 days, status `TRIAL` |
| Quotas | Enforced transactionally for campuses, students, staff |
| Feature gates | `library`, `transport`, `homework`, `support` |
| Payment | Manual: bKash/Nagad/bank reference → platform review with exact amount → activation; unique `(method, reference)` |
| Grants | Platform admin can activate with a reason and idempotency key (covers cash/cheque) |
| Receipts | PDF after approval |
| Suspension | Organisation status blocks writes |
| Plan editing | Platform admin can change price, limits, features |
| Not implemented | Reminders, grace, proration, downgrade, cancellation, refunds, invoices before payment, VAT, automatic gateway collection, SMS credits |

## 2. Market signals from this session (weak evidence)

- One undated vendor proposal found online quotes **BDT 15 per student per month** with free installation and training.
- International references (India: single-digit to low-double-digit rupees per student per month from some vendors; global averages several US dollars per student) are not transferable directly.

Sources: [SCHOOBEE proposal (undated, hosted on a government domain)](https://ddrs.bwdb.gov.bd/assets/uploads/fax/SCHOOBEE_14_09%20(1).docx), [Capterra: school management software cost](https://www.capterra.com/resources/school-management-software-cost/).

Reading the in-code plans against the BDT 15/student signal: Starter at BDT 2,500 for up to 500 students equals BDT 5/student at the cap but BDT 25/student for a 100-student school. Small schools — the easiest first customers — are the ones the Starter price fits worst.

## 3. Pricing structure options

| Model | Pros | Cons |
|---|---|---|
| Per-institution tiers (current) | Simple to explain and collect annually | Punishes small schools; under-charges large ones within a tier |
| Per active student per month | Scales with value; familiar to schools that already pay per-student vendors | Disputes over student counts; needs an "active student" definition and monthly true-up |
| Hybrid: base fee + per-student above an included number | Fair across sizes; predictable minimum | Slightly harder to explain |
| Module-based add-ons | Lets small schools start cheap | Too many SKUs confuse buyers |

**Recommendation (hypothesis to test): hybrid, billed annually or per term, with tiers expressed by student band.**

| Plan | Student band | Annual (BDT) | Effective monthly | Includes |
|---|---|---:|---:|---|
| Small | up to 200 | 18,000 | 1,500 | Core ERP: students, attendance, exams, fees, notices, guardian portal, 1 campus |
| Standard | 201–600 | 36,000 | 3,000 | + admissions, homework, reports, priority support |
| Large | 601–1,500 | 72,000 | 6,000 | + library, transport, 2 campuses |
| Multi-campus / college | 1,501+ or 3+ campuses | from 120,000 | from 10,000 | + consolidated reports, white-label options, onboarding manager |

Add-ons and services (hypotheses):

| Item | Price idea |
|---|---|
| Setup and training | BDT 5,000–15,000 one-time by size |
| Data migration (students, dues, past results) | BDT 5,000–20,000 |
| SMS packages | Prepaid credits at a margin over provider cost; public price lists seen in this session range roughly BDT 0.15–0.60 per SMS by type and volume — confirm with a contracted provider |
| School website | BDT 5,000–10,000/year add-on |
| White-label ERP domain and branding | BDT 15,000+/year |
| Premium reporting / custom report cards | One-time design fee |

What to validate with 10–15 school conversations: annual versus monthly preference (budget cycles follow the academic year); who pays (owner, managing committee); whether schools pass a "technology/SMS fee" on to guardians; expected setup help.

## 4. Lifecycle rules to implement

| Stage | Rule |
|---|---|
| Trial | 30 days or until the first invoice run, whichever is later; verified phone required; one trial per institution |
| Reminder | In-app banner + SMS/email to owner at T-14, T-7, T-1 |
| Grace | 14 days after period end with full function and a daily banner (schools pay late; locking attendance and fees harms children's records) |
| Past due | After grace: read-only for staff, guardian portal stays readable, exports allowed |
| Suspension | Manual, for abuse or long non-payment |
| Upgrade | Immediate; charge prorated difference to period end |
| Downgrade | At renewal; must fit quotas |
| Cancellation | Stops renewal; data retained 12 months (academic records), export available |
| Refund | Policy text + admin action creating a negative payment with reason |

## 5. Entitlements

Keep quotas and feature flags. Add: SMS credit balance; storage quota for documents; number of campuses; module flags for website, admissions, certificates. Expose entitlements in `auth/me` (already includes subscription and plan) so navigation and upgrade prompts stay consistent.

## 6. Collection

- **Now:** keep manual review. Add an invoice PDF before payment and support cheque/cash via "grant" with collector name.
- **Next:** hosted checkout through an aggregator for one-off term/annual payments (rate cards must be obtained in writing; third-party pages seen in this session quote roughly 2–2.5 % per transaction).
- **Do not assume auto-debit.** Public sources in this session disagree on recurring-billing support for local gateways. Annual/term prepayment suits schools anyway.

## 7. Metrics

Sign-ups → activated schools (attendance taken on ≥ 5 days and ≥ 1 invoice run during trial) → paid; average students per school; revenue per student; renewal rate at the academic-year boundary (the real churn moment); SMS revenue per school; support hours per school per month.
