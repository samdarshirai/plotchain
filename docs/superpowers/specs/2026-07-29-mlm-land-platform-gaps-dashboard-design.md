# PlotChain — Gap-Fill & Dashboard Design

**Companion to:** `mlm-land-platform-spec.md`
**Date:** 2026-07-29
**Status:** Approved by user, pending implementation planning

## 1. Purpose

`mlm-land-platform-spec.md` documents the binary MLM compensation engine, domain model, and architecture for PlotChain (a land-sales platform for associates in Patna, Bihar operating on a binary 2-leg MLM structure). This document extends that spec with:

1. Gaps identified against real-world binary-MLM software and India's direct-selling regulatory requirements.
2. A detailed design for the Dashboard screen — the associate app's hero screen.

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

Explicitly out of scope (decided, not deferred by omission):
- Buyer-side KYC and sale-deed/registry document tracking — assumed handled by a separate legal/registry system.
- Site-visit booking/scheduling — sales are recorded directly, no visit-booking step in-app.
- Gamification (leaderboards, extra badges) — the base spec's rank/reward tier system already covers progression; no additional retention mechanic added.
- Separate Business Volume (BV) unit — compensation math continues to use the sale's cash price directly, consistent with the base spec's existing rule-versioning protection against retroactive changes.

## 4. Domain Model Additions

### 4.1 Project / Plot

| Field | Type | Notes |
|---|---|---|
| project_id | UUID | PK |
| name, location | string | |
| plot_id | UUID | PK |
| plot_number | string | |
| dimensions | string | |
| price | decimal | current list price, admin-editable |
| status | ENUM(available, booked, sold) | |
| site_map_ref | URL/ref | |

Admin-only CRUD (associates get read-only browse/search).

### 4.2 Sale (extends base spec)

Add `plot_id` (FK to Plot). Add `sale_price` (decimal) — a snapshot of `Plot.price` at the moment of sale, so a later price-list change never retroactively alters a closed sale's compensation math. This replaces the base spec's free-form `plot_amount` field with the same semantics, now tied to an actual inventory record.

### 4.3 Wallet & Withdrawal

| Entity | Field | Notes |
|---|---|---|
| Wallet | associate_id, balance | credited by cycle-close net_amount |
| WithdrawalRequest | request_id, associate_id, amount, status(pending/processing/paid/rejected), bank_ref, requested_at, processed_at | associate-initiated |

### 4.4 Compliance

| Entity | Field | Notes |
|---|---|---|
| IncomeDisclosureAcknowledgment | associate_id, version, accepted_at | must exist before activation fee payment is accepted |
| GrievanceTicket | ticket_id, associate_id, category, description, status(open/in_review/resolved), assigned_to, resolution_note, created_at, resolved_at | resolution_note mandatory on close, same audit-trail principle as the base spec's Audit Log |

## 5. Compensation Engine — Timing Rule

No change to the formulas in the base spec (§3). One rule made explicit for installment-sale handling: **Direct Income fires on Sale creation (booking), calculated on the full `sale_price`, regardless of the buyer's payment schedule.** Buyer installment collection is a billing concern outside this app's scope. `net_amount` (after TDS/admin deductions, KYC gate) credits `Wallet.balance` rather than triggering an immediate bank transfer — the base spec's Payout Service becomes a Wallet & Withdrawal Service (§6).

## 6. Architecture Delta

Extends the base spec's services (§4) — no new microservices introduced, per YAGNI: the platform doesn't have scale to justify separate Inventory/Wallet/Compliance services yet.

- **Sales Service** — gains a Plot/Inventory sub-domain (admin CRUD endpoints); `Sale` gains `plot_id` FK.
- **Payout Service → Wallet & Withdrawal Service** — cycle close credits `Wallet.balance`; a separate withdrawal flow (associate-initiated) triggers the actual payment gateway/bank transfer.
- **Compliance module** (within Admin/Reporting Service) — income disclosure acknowledgment records, grievance ticket queue with a grievance-officer role.
- **Notification Service** — add WhatsApp Business API as a channel alongside SMS/email/push.

## 7. Screens — Additions to Base Spec §5

### 7.1 Associate App

| Screen | Purpose | Key elements |
|---|---|---|
| **Browse Plots** | Select inventory when recording a sale | Filter by project/price, plot status, site map image |
| **Income Disclosure** | One-time regulatory acknowledgment | Shown at signup, before activation fee payment; must accept to proceed |
| **Wallet & Withdraw** | Replaces base spec's Payout History | Withdrawable balance, Withdraw action, bank details, withdrawal status list |
| **Raise Grievance** | Compliance-required complaint channel | Category, description, ticket status list |
| **Language toggle** | Hindi/English | In Profile & Settings |

### 7.2 Admin Panel

| Screen | Purpose | Key elements |
|---|---|---|
| **Plot/Inventory Management** | Manage projects/plots | CRUD, status changes, site map upload |
| **Grievance Queue** | Resolve associate complaints | Grievance-officer role, view/assign/resolve, mandatory resolution note |
| **Compliance Reports** | Regulatory record-keeping | Income disclosure acknowledgment log (who/when/version) |
| **Withdrawal Approval** | Extends base spec's Ledger/Payout Approval screen | Pending withdrawal requests, approve/hold |

## 8. Dashboard — Hero Screen Design

Mobile-first, single scrolling screen. Layout validated with the user via mockup comparison (three widget orderings tested: stat-first, leg-gauge-hero, action-first) — **stat-first** selected.

Widget order, top to bottom:

1. **KYC pending banner** — conditional, shown only while `kyc_status != verified`.
2. **Cycle income card** — Direct / Matching / Total for the current cycle; taps through to Income Statement.
3. **Wallet card** — withdrawable balance + Withdraw action.
4. **Leg volume gauge** — L vs R volume as a bar/gauge with ₹ values and the amount that will match at cycle close. This is the single most identity-defining widget for a binary-MLM dashboard (confirmed against Epixel/GenSoftech patterns) and was previously absent from the base spec's dashboard description.
5. **Rank progress** — current rank, % progress, progress bar to next rank.
6. **Team snapshot** — total downline size, active-today count, new joins this cycle.
7. **Quick actions row** — "+ Record Sale", "+ Add Referral" — surfaced directly on the dashboard rather than requiring navigation to separate screens.
8. **Cycle countdown** — "Cycle closes in N days."
9. **Announcements / plot highlight strip** — company news, new project launches.

## 9. Non-Functional Additions

- Hindi/English localization for the associate app UI.
- WhatsApp Business API as a notification channel (income credited, KYC status, rank-up, grievance updates).
- Legal: Consumer Protection (Direct Selling) Rules 2021 compliance — DoCA self-declaration is an operational/legal filing (outside app scope), but income disclosure acknowledgment and grievance ticketing (§4.4, §7) are the in-app compliance surfaces this design adds.
