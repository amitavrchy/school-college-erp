# Release verification — 12 November 2026

Verified on Windows with Node.js 24, Chrome and Docker Desktop's Linux engine. The deployed local stack uses production Next.js/NestJS builds, PostgreSQL 17 and Redis 7.

| Check                                                | Result                                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Backend unit/security tests                          | 7 passed                                                                                                             |
| Database/HTTP acceptance tests                       | 19 passed, including parent suites                                                                                   |
| Chrome browser tests                                 | 7 passed                                                                                                             |
| Formatting, application and test/tooling type checks | Passed                                                                                                               |
| Backend/frontend production builds                   | Passed                                                                                                               |
| Dependency audits in both packages                   | 0 reported vulnerabilities                                                                                           |
| Docker stack                                         | All four services healthy                                                                                            |
| PostgreSQL backup/restore                            | Restored into a separate database; 200 students matched                                                              |
| Redis outage/recovery                                | Readiness returned 503, liveness stayed 200, readiness recovered to 200                                              |
| Fresh production bootstrap                           | Empty database migrated; owner and three plans created without demo data; rerun preserved password and edited prices |
| Test fixture cleanup                                 | No test institutions remained                                                                                        |

API acceptance covers role and tenant isolation, guardian privacy, concurrent payment idempotency, dual-control waivers, absence deduplication, encrypted document access, admission capacity, promotion/transfer and closed sessions. SaaS coverage includes pending wallet references, duplicate prevention, exact-amount review, concurrent activation, idempotent manual grants, expired subscriptions, library stock/fines, transport capacity/boarding and private homework/support.

Browser coverage includes every core workspace, sample attendance/payment persistence, guardian navigation, mobile overflow/14px minimum text, landing interactions, institutional signup, platform review, subscription activation and PDF receipt download. Automated axe checks reported no WCAG 2 A/AA or 2.1 A/AA violations on landing, login, overview, library, transport, homework, support and subscription routes. Desktop/mobile landing screenshots were also reviewed.

This is local release evidence. Live SMS/merchant delivery, public HTTPS deployment, infrastructure-specific load capacity, full manual accessibility review and operational backup scheduling require the target production environment. Receiving accounts must be configured by the platform owner; automated-test account numbers are not merchant accounts.
