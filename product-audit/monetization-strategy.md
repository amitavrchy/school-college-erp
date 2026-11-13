# School & College ERP — Monetization Strategy

Figures are hypotheses or illustrative arithmetic, not forecasts. Plan structure is in `subscription-strategy.md`.

## 1. Revenue architecture

| Line | Mechanism | Status in code |
|---|---|---|
| Institution subscriptions | Tiered plans with quotas, annual or monthly | Implemented (manual payments) |
| Student-based pricing | Band or per-student component | Quotas exist; price is per tier |
| Additional modules | Library, transport, homework, support flags; website and admissions could be flags | Partially implemented |
| Setup, training, data migration | One-time fees | Not in product (record via manual grant/invoice) |
| SMS packages | Prepaid credits | Not implemented; SMS currently unmetered |
| Premium support | SLA tier | Not implemented |
| White-label | Custom domain/branding | Website domains exist; ERP branding limited to accent colour |
| Payment facilitation fee | Fee on online tuition collection | Not recommended until per-school settlement and legal review |

## 2. Target customers

| Segment | Fit | Notes |
|---|---|---|
| Private schools and kindergartens, 150–800 students | Best first segment | Owner decides; fee collection and guardian communication are felt pains |
| Private colleges, coaching centres | Good | Session and exam structures differ; coaching centres want batch and monthly fee features |
| Multi-campus school groups | Later | Need consolidated reporting and onboarding support |
| Government/MPO schools | Hard | Committee decisions, budget constraints, compliance reporting formats |
| Madrasas | Possible | Curriculum and terminology differences |

Decision cycle follows the academic year: institutions adopt systems before a new session. Schools commonly run a January–December year, so the weeks before January are the main buying window; colleges differ. Sales made mid-year often start with fees only.

## 3. Competition and positioning (assessment limits)

Local school-management vendors exist and commonly price per student or per institution with on-site setup; a named competitor review was not performed — NOT ASSESSED. Credible differentiation from the code: self-service start with a real trial, guardian-scoped portal, fee engine with idempotent payments and maker-checker waivers, online admission with waitlist automation, optional school website. Weak spots versus established vendors: Bangla, data import, printed document quality, exam-format depth, on-site support.

## 4. Revenue scenarios (illustrative)

Average annual contract assumed across the bands in `subscription-strategy.md`; SMS margin and setup fees shown separately.

| Scenario | Paying institutions | Avg annual contract (BDT) | ARR | MRR equivalent | Setup fees in year | SMS gross margin / year | Assumed annual churn |
|---|---:|---:|---:|---:|---:|---:|---:|
| Conservative | 10 | 30,000 | 300,000 | 25,000 | 60,000 | 30,000 | 20 % |
| Base | 50 | 40,000 | 2,000,000 | 166,667 | 300,000 | 250,000 | 15 % |
| Optimistic | 200 | 45,000 | 9,000,000 | 750,000 | 1,000,000 | 1,200,000 | 10 % |

Costs (estimates): infrastructure BDT 8,000–45,000/month by stage (`../04-infrastructure-cost-analysis.md`); SMS at provider cost; payment fees only if a gateway is used; **onboarding and support staff dominate** — a school needs several days of setup help and ongoing phone support; assume one implementation/support person per 25–40 schools (BDT 25,000–40,000/month each) plus travel.

## 5. Unit economics to measure

| Metric | Definition |
|---|---|
| CAC | Sales visits, demos, commissions ÷ new paying schools |
| Implementation cost | Onboarding hours × rate per school |
| Gross margin | (Subscription + SMS margin − hosting − SMS cost − gateway) ÷ revenue |
| Net revenue retention | Renewals + expansions (more students, modules, SMS) ÷ prior-year revenue |
| Payback | (CAC + implementation) ÷ annual gross profit per school |
| Support load | Tickets/calls per school per month (support module exists) |

Annual contracts paid up front give payback within the first year only if implementation is kept under roughly a third of the first-year contract; setup fees help.

## 6. Go-to-market

1. **Pilots now (free for one term, 2–3 schools):** ideally schools where you know the owner or principal; load their data yourself; attend the first fee cycle and first exam.
2. **Paid early adopters (10–15 schools):** discounted first year, case-study agreement, WhatsApp support line.
3. **Timing:** concentrate demos in the pre-session window; mid-year pitch "start with fees and SMS".
4. **Channels:** school owners' associations and kindergarten associations, education fairs, referrals between principals, local IT vendors as resellers with commission, Facebook pages aimed at school owners.
5. **Demo assets:** the landing page and demo tenant exist (`prisma/seed.ts`); add a Bangla demo video and sample report card/receipt.
6. **Retention:** term-wise review call; year-end promotion assistance; SMS usage reports; early renewal discount.
7. **Referral:** one month free per referred paying school.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Long sales cycle and committee decisions | Start with owner-run private schools |
| High support burden | Setup assistant, imports, Bangla help videos; charge for setup |
| Seasonal revenue recognition | Annual prepay; term billing option |
| Schools expecting customisation (report-card formats) | Template options + paid custom design, not code forks |
| Minors' data responsibilities | Privacy notice, access controls, retention policy, incident process |
| Regulatory questions on collecting tuition online on behalf of schools | Keep manual/off-platform payment until a compliant per-school model is confirmed |

## 8. Readiness

Monetization readiness is the highest of the three products: a school can sign up, be limited by plan, pay by a manual reference and receive a receipt today. Missing for a dependable revenue operation: reminders and grace, invoices, SMS metering, student-band pricing, and operator reporting.
