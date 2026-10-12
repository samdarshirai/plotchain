# Plot-booking reference-gap — units

Spec: `2026-10-12-plot-booking-reference-gap-plan.md` (approved 2026-10-12) + `docs/design/plot-booking-vs-reference-video.md`.
Owner decisions: no PLC, no Plot Transfer; admin-only payment entry; only confirmed (PAID) payments count. Styling per root `DESIGN.md`.
Shared-file warning (sequence, never parallelize): `BookingService.java`, `SecurityConfig.java`, `bookings-emi.model.ts`, `bookings-emi.service.ts`, `en.json`/`hi.json`, `app.routes.ts`.

| Unit | Type | Title | Depends on | Status | Plan file | Merged commits |
|---|---|---|---|---|---|---|
| U1 | backend | V45 migration + entities (ENTERED, confirm cols, payment mode, discount/snapshots, PAY_CONFIRMED) | — | merged | docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-1-v45-migration.md | ab49ae8..fde192e |
| U2 | backend | Two-step payment logic (enter / confirm / bulk confirm, threshold on PAID only, cancel voids ENTERED) | U1 | merged | docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-2-two-step-payments.md | 1df65f6..636a7fc (merge ebc6745) |
| U3 | backend | Discount on create, register filters (dates, q, cancelled range), payments list, last-EMI report, sales-history associate fields, size=0 fix | U1, U2 | merged | docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-3-discount-filters-lists.md | 5119f10..564443d (merge 619dc91) |
| U4 | backend | Reschedule instalments (Add Plot EMI) — optional, confirm wording first | U2 | skipped | | |
| U5 | frontend | Foundations: shared pager, CSV/print util, models, services, i18n | U2, U3 | planned | docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-5-fe-foundations.md | |
| U6 | screen | Bookings & EMI tabs: Register upgrade, Unconfirmed, Confirmed(+receipt), Cancelled, EMI-by-last-date, seal enter/confirm | U5 | pending | | |
| U7 | screen | Projects & Plots: Rate column/search/export, discount in book form | U3, U5 | pending | | |
| U8 | screen | Associate defects #21-24 (empty-state copy, My Sales, Team pages style, My Bookings route, project placeholder) | U3, U5 | pending | | |
