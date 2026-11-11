# Campus One implementation plan

The source of truth is `Project_spec.md`. Work is delivered as focused commits with current timestamps and the repository owner's GitHub attribution.

1. Workspace, infrastructure and relational data model.
2. Authentication, role permissions and campus/student data isolation.
3. Academic administration and student lifecycle.
4. Admissions, transactional seat allocation and waitlists.
5. Attendance, leave, imports and deduplicated absence alerts.
6. Fee structures, FIFO payments, waivers and provider verification.
7. Examination workflow, grading and printable report cards.
8. Notices, background work, realtime and guardian portal.
9. Responsive product UI, 14px minimum typography and reduced-motion support.
10. Integration tests, production builds, documentation and incremental pushes.

External SMS/payment delivery requires merchant credentials. Console SMS and manual payment are explicit development options; they do not claim to deliver real messages or collect mobile-money payments.
