# PlotChain — Gap-Fill & Dashboard Design

**Companion to:** `mlm-land-platform-spec.md`
**Date:** 2026-07-29
**Status:** Approved by user, pending implementation planning
**Addendum (2026-07-29):** Revised after cross-review against `land-mlm-platform-prd.md`. Adds e-PIN, Digital ID Card, and grievance/support-ticket reconciliation; adopts PRD's confirm-date gate (OQ1 — PRD is source of truth, trigger mechanism itself stays open, not decided here) and resolves OQ4 (ID card QR purpose); reinstates EMI scheduling (previously scoped out in error — it's required by the confirm-gate rule below).

## 1. Purpose

`mlm-land-platform-spec.md` documents the binary MLM compensation engine, domain model, and architecture for PlotChain (a land-sales platform for associates in Patna, Bihar operating on a binary 2-leg MLM structure). This document extends that spec with:

1. Gaps identified against real-world binary-MLM software and India's direct-selling regulatory requirements.
2. A detailed design for the Dashboard screen — the platform's hero screen.

It does not replace the base spec. Read together, the two documents form the full v1 scope.

## 2. Research Basis

Reviewed against: Epixel/Infinite MLM/GenSoftech binary MLM software patterns (leg-volume gauge as the standard hero widget), and India's Consumer Protection (Direct Selling) Rules, 2021 (mandatory DoCA self-declaration, income disclosure to recruits, grievance redressal mechanism, prohibition on recruitment-only earnings).

Sources: [Epixel Real Estate MLM](https://www.epixelmlmsoftware.com/industries/real-estate), [Direct Selling Rules 2021 compliance guide](https://finlaw.in/blog/mlm-compliance-in-india-a-complete-guide-for-2025), [Binary MLM plan explained](https://gensoftech.com/blog/binary-mlm-software-explained).

## 3. Scope Decisions

Confirmed in scope for this design:
- Legal compliance features (income disclosure acknowledgment, grievance ticketing) — Direct Selling Rules 2021 requires these; skipping them is a real legal exposure for a Bihar-based land MLM operation.
- Plot/inventory management (project, plot, price, availability) — the base spec's `Sale` entity had no reference to *which* plot was sold, which is a functional gap for a land-sales platform.
- In-app wallet + on-demand withdrawal, replacing direct-to-bank payout.
- Hindi/English localization and WhatsApp notification channel, matching the target associate base's actual usage patterns in Patna/rural Bihar.
- e-PIN issuance/redemption (admin/upline-issued only, no associate self-generation) — PRD flagged this as open (§9 OQ2). Direct-selling regulators scrutinize pay-to-participate income; admin-controlled issuance is the safer v1 default. Revisit if business wants self-serve top-up.
- Digital ID Card with a **functional** QR code — PRD open question 4 resolved: QR encodes the referral/placement link and drives sign-up attribution programmatically, not just cosmetic branding, since recruitment attribution is core to a binary MLM.
- Sale confirmation gate (PRD's Payment Date vs Confirm Date distinction, OQ1) — a booking is captured as `PlotBooking` and does **not** feed the compensation engine until confirmed. **Confirm trigger mechanism is left open per PRD OQ1** (manual admin action, automatic %-paid threshold, or KYC-gated — PRD does not decide between these; neither does this doc). See §4.2, §5.
- EMI/installment scheduling — reinstated. The confirm-threshold rule above needs partial-payment tracking, so EMI can't be pushed fully outside the app after all (this design's original stance in §5 was wrong on this point).

Explicitly out of scope (decided, not deferred by omission):
- Buyer-side KYC and sale-deed/registry document tracking — assumed handled by a separate legal/registry system.
- Site-visit booking/scheduling — sales are recorded directly, no visit-booking step in-app.
- Gamification (leaderboards, extra badges) — the base spec's rank/reward tier system already covers progression; no additional retention mechanic added.
- Separate Business Volume (BV) unit — compensation math continues to use the sale's cash price directly, consistent with the base spec's existing rule-versioning protection against retroactive changes.
- Associate self-generated e-PINs — always admin/upline issued in v1.
- Reversal handling for a confirmed sale that later cancels (e.g. buyer defaults after confirm) — commissions already paid on a confirmed sale are not clawed back in v1. Flag for finance sign-off before build.
- The confirm trigger mechanism itself (manual / automatic %-paid / KYC-gated) — PRD OQ1, unresolved. This doc adopts the *gate* (booking ≠ compensation-eligible until confirmed) but does not pick a trigger; that's still a business decision.

## 4. Domain Model Additions

None of the entities below carry `tenant_id`. The product was later confirmed single-tenant (admin + associates), superseding the base spec's multi-tenancy model (PRD §8 NFR); see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md` for the decision and removal.

### 4.1 Project / Plot

| Field | Type | Notes |
|---|---|---|
| project_id | UUID | PK |
| name, location | string | |
| plot_id | UUID | PK |
| plot_number | string | |
| type | ENUM(normal, corner) | carried from PRD, dropped in error in the original pass |
| dimensions | string | renamed from PRD's `area` |
| rate | decimal | per-unit rate, carried from PRD |
| price | decimal | current list price, admin-editable |
| extra_price | decimal | corner/premium surcharge, carried from PRD |
| status | ENUM(available, booked, sold) | |
| site_map_ref | URL/ref | new |

Admin-only CRUD (associates get read-only browse/search).

### 4.2 Booking, Sale & EMI (extends base spec, adopts PRD's confirm-gate structure — OQ1 trigger itself still open)

A sale is captured in two stages, not one — this replaces the original pass's "Sale created directly at booking" model:

| Entity | Field | Notes |
|---|---|---|
| PlotBooking | id, plot_id (FK), associate_id, buyer_ref, booking_date, total_price, paid_amount, rest_amount, status(active/confirmed/cancelled) | created when the sale is recorded in-app; does **not** yet feed the comp engine |
| EMISchedule / EMIPayment | booking_id (FK), installment_no, due_date, amount, paid_date, status | carried back in from the PRD — needed to evaluate the confirm threshold below |
| Sale (extends base spec) | booking_id (FK), plot_id (FK), sale_price, confirm_date | created only once `PlotBooking` is confirmed (§5 — trigger mechanism still open per PRD OQ1); `sale_price` snapshots `total_price` at confirm time so a later price-list change never retroactively alters a closed sale's compensation math |

Until confirmed, a booking is visible in Team/EMI reporting only — it does not count toward leg volume or any income calculation.

### 4.3 Wallet & Withdrawal

| Entity | Field | Notes |
|---|---|---|
| Wallet | associate_id, balance | credited by cycle-close net_amount |
| WithdrawalRequest | request_id, associate_id, amount, status(requested/under_review/approved/rejected/disbursed), bank_ref, requested_at, processed_at | associate-initiated; status vocabulary aligned to PRD (was pending/processing/paid/rejected in the original pass — two docs disagreeing on enum values isn't acceptable); submission requires transaction-password re-entry (PRD §8 NFR, two-factor financial gating) |

### 4.4 Compliance

| Entity | Field | Notes |
|---|---|---|
| IncomeDisclosureAcknowledgment | associate_id, version, accepted_at | must exist before activation fee payment is accepted |
| GrievanceTicket | ticket_id, associate_id, category, description, status(open/in_review/resolved), assigned_to, resolution_note, created_at, resolved_at | resolution_note mandatory on close, same audit-trail principle as the base spec's Audit Log. **Distinct from the base spec's `SupportTicket`** (general help-desk issues, any category): `GrievanceTicket` is the Direct Selling Rules 2021 statutory complaint channel specifically — mandatory resolution note, grievance-officer role, own audit trail for regulatory inspection; not merged with general support. |
| EPin | id, code, status(unused/used), issued_to, issued_by, issued_at, used_at, linked_transaction_ref | carried from PRD, missing from the original pass entirely. Admin/upline-issued only (§3). Reporting needs issuance-vs-redemption reconciliation (PRD §7.2) to trace activation-fee revenue. |
| IDCard | — | generated on-demand from Associate + Rank data, not persisted (matches PRD's note). QR payload = referral/placement link — functional, drives sign-up attribution (resolves PRD OQ4). |

## 5. Compensation Engine — Timing Rule

No change to the formulas in the base spec (§3). Timing rule, revised from the original pass — PRD is source of truth here, so this doc adopts PRD's gated structure without inventing a resolution PRD didn't make:

**Direct Income fires when a `PlotBooking` is confirmed, not at booking creation.** PRD OQ1 leaves the confirm trigger itself undecided — manual admin action, automatic %-paid threshold, or KYC-gated — and this doc doesn't resolve it either; that's a business decision still pending, not an engineering one. Whichever mechanism is chosen, it should live alongside the other compensation-rule config (PRD §8, rule versioning) so it can change without a re-platform. Until confirmed, a booking contributes to Team/EMI reporting only, never to leg volume or income. Once confirmed, income is calculated on the snapshotted `sale_price` (§4.2). Buyer installment collection past that point is still a billing concern, not a compensation concern — but the app has to track paid-so-far regardless, since a %-paid threshold (if chosen) needs it.

`net_amount` (after TDS/admin deductions, KYC gate) credits `Wallet.balance` rather than triggering an immediate bank transfer — the base spec's Payout Service becomes a Wallet & Withdrawal Service (§6), and withdrawal submission additionally requires transaction-password re-entry (PRD §8 NFR).

## 6. Architecture Delta

Extends the base spec's services (§4) — no new microservices introduced, per YAGNI: the platform doesn't have scale to justify separate Inventory/Wallet/Compliance services yet.

- **Sales Service** — gains a Plot/Inventory sub-domain (admin CRUD endpoints) and a Booking/EMI sub-domain (confirmation logic runs here, mechanism per PRD OQ1 — still open); `Sale` is now created from a confirmed `PlotBooking` rather than directly.
- **Payout Service → Wallet & Withdrawal Service** — cycle close credits `Wallet.balance`; a separate withdrawal flow (associate-initiated, transaction-password gated) triggers the actual payment gateway/bank transfer.
- **Compliance module** (within Admin/Reporting Service) — income disclosure acknowledgment records, grievance ticket queue with a grievance-officer role (kept separate from the general support-ticket queue, §4.4).
- **e-PIN module** (within Admin/Back-office or Sales Service) — generation, allocation, redemption, and issuance-vs-redemption reconciliation reporting (PRD §7.2). Missing from the original architecture pass entirely.
- **Notification Service** — add WhatsApp Business API as a channel alongside SMS/email/push.

## 7. Screens — Additions to Base Spec §5

### 7.1 Admin Panel

| Screen | Purpose | Key elements |
|---|---|---|
| **Plot/Inventory Management** | Manage projects/plots | CRUD, status changes, site map upload |
| **Grievance Queue** | Resolve associate complaints (statutory channel) | Grievance-officer role, view/assign/resolve, mandatory resolution note |
| **Support Ticket Queue** | General help-desk, carried from base spec | Kept distinct from Grievance Queue — different role, different SLA, no mandatory resolution note |
| **Compliance Reports** | Regulatory record-keeping | Income disclosure acknowledgment log (who/when/version) |
| **e-PIN Generation/Allocation** | Issue e-PINs — missing from the original pass entirely | Batch-generate, assign to associate/upline, issuance-vs-redemption reconciliation report |
| **Withdrawal Approval** | Extends base spec's Ledger/Payout Approval screen | Pending withdrawal requests, approve/reject (status vocabulary aligned to PRD, §4.3) |

## 8. Dashboard — Hero Screen Design

Single scrolling screen. Layout validated with the user via mockup comparison (three widget orderings tested: stat-first, leg-gauge-hero, action-first) — **stat-first** selected.

Widget order, top to bottom:

1. **KYC pending banner** — conditional, shown only while `kyc_status != verified`.
2. **Cycle income card** — Direct / Matching / Total for the current cycle; taps through to Income Statement.
3. **Wallet card** — withdrawable balance + Withdraw action (transaction-password re-entry required on submit, §4.3).
4. **Leg volume gauge** — L vs R volume as a bar/gauge with ₹ values and the amount that will match at cycle close. This is the single most identity-defining widget for a binary-MLM dashboard (confirmed against Epixel/GenSoftech patterns) and was previously absent from the base spec's dashboard description.
5. **Rank progress** — current rank, % progress, progress bar to next rank.
6. **Team snapshot** — total downline size, active-today count, new joins this cycle.
7. **Quick actions row** — "+ Record Sale", "+ Add Referral" — surfaced directly on the dashboard rather than requiring navigation to separate screens.
8. **Cycle countdown** — "Cycle closes in N days."
9. **Announcements / plot highlight strip** — company news, new project launches.

## 9. Non-Functional Additions

- Hindi/English localization for the UI.
- WhatsApp Business API as a notification channel (income credited, KYC status, rank-up, grievance updates).
- Legal: Consumer Protection (Direct Selling) Rules 2021 compliance — DoCA self-declaration is an operational/legal filing (outside app scope), but income disclosure acknowledgment and grievance ticketing (§4.4, §7) are the in-app compliance surfaces this design adds.
- Transaction-password re-entry enforced on withdrawal-request submission, matching the base spec/PRD's two-factor financial gating pattern (login password vs. transaction password) — missing from the original pass.

## 10. Note for PRD maintainer

This design adds features the PRD (`land-mlm-platform-prd.md`) doesn't list as in-scope: income disclosure acknowledgment, grievance ticketing, WhatsApp notification channel. These are legally motivated (Direct Selling Rules 2021), not scope creep, but the PRD itself is now stale on this point — recommend folding them into the PRD's feature list (§5) and Non-Goals (§3) so the two documents don't silently disagree.

On the confirm-date conflict specifically: PRD is treated as source of truth, so this doc adopts PRD's gated structure (booking ≠ compensation-eligible until confirmed) but does **not** invent a trigger mechanism PRD never decided. PRD OQ1 (manual / automatic %-paid / KYC-gated) remains open — needs a business decision before build, along with the related reversal-of-a-confirmed-sale question (§3).
