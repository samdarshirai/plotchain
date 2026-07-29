# PRD: Binary MLM Land-Sales Platform

**Status:** Draft v2
**Owner:** [you]
**Last updated:** July 2026

---

## 1. Purpose & Background

Land-selling companies (starting with a Patna-based reference client) recruit a network of "associates" who sell plots and recruit sub-associates in a binary (2-leg) structure. Associates earn multi-tier commissions based on their own sales and their downline's sales volume. Today this is run on a bespoke PHP app per company; the goal is a reusable platform with configurable compensation rules for this company's associate network. *(Superseded — product decided single-tenant, see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`. This PRD originally scoped a multi-tenant SaaS platform ("one codebase, many branded instances"); that direction was dropped in favor of a single-tenant deployment for one organization.)*

**Note on scope of legality:** plotted-land schemes combined with binary-recruitment income sit close to patterns regulators have historically scrutinized in India (Prize Chits and Money Circulation Schemes Banning Act; SEBI/RBI action on land-banking "collective investment schemes"). This PRD covers the software only — compensation-rule legality should be reviewed with counsel before go-live. Recommend building compensation-rule configuration flexibly enough that the company can adjust structure without a re-platform if regulatory guidance changes.

---

## 2. Goals

- Let a land company onboard, configure its own compensation plan (%, thresholds, rank names), and go live without custom code.
- Automate direct/matching/sponsor/royalty/reward income calculation on a recurring settlement cycle (15th/30th), fully auditable.
- Give associates self-service visibility into their network, sales, and earnings.
- Give company admins full oversight: KYC review, payout approval, rule configuration, dispute/audit trail.
- ~~Support multi-tenant deployment (one codebase, many branded instances) — matches your Vidian Solutions multi-product hosting model.~~ *(Superseded — product decided single-tenant, see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`.)*

## 3. Non-Goals (v1)

- Public marketplace / plot discovery for retail buyers (this is an internal associate tool, not a consumer property portal).
- ~~Cross-tenant network — each tenant's associate tree is isolated.~~ *(Superseded — moot: product decided single-tenant, see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`. There is one associate tree for the one organization.)*
- Automated regulatory compliance/legal-risk scoring.

## 4. Personas

| Persona | Description | Primary needs |
|---|---|---|
| **Associate** | Recruits + sells plots | See earnings, manage team, submit sales, withdraw money |
| **Company Admin / Finance** | Runs the back office for the company | Approve payouts, review KYC, configure rules, run reports |
| ~~**Platform Super-Admin**~~ | ~~You / your team~~ | ~~Onboard new tenant companies, monitor system health, billing~~ *(Superseded — no longer applicable, product is single-tenant; see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`.)* |

---

## 5. Feature List (from spec + video walkthrough)

### 5.1 Associate-facing
1. Auth (Associate ID + password login, "remember me")
2. Dashboard — cycle summary (carry-forward L/R, new L/R business, total business, associate counts, all income types)
3. Profile (view/edit, login password change, **transaction password** change — a second password specifically gating financial actions)
4. **e-PIN management** — activation/top-up codes (seen in nav; needs its own section, see open questions)
5. Genealogy:
   - Direct downline list
   - Full left/right downline list (flat, searchable/paginated table)
   - Interactive tree view
   - Active team list / Inactive team list (date-range filterable)
6. Plot Details:
   - View available plots (with colour-coded availability grid)
   - Team purchase plot list
   - Left plot booking / Right plot booking (with per-booking payment/due breakdown)
7. Reports:
   - Business date-wise (left/right, date-range filter)
   - EMI report (installment-based plot payments)
8. Incomes (each as its own report screen):
   - Direct Income
   - Matching Income
   - Sponsor Matching Income
   - Self Performance Bonus
   - Royalty Bonus
   - Total Income Report (all income types + TDS + admin charge + payable amount + paid status, per cycle)
   - My Reward (reward tiers achieved/pending, claim status)
9. **Wallet & Withdrawal** *(found in video, missing from original spec)*:
   - Available balance
   - Request withdrawal (subject to minimum threshold)
   - Withdrawal status tracking
10. **Digital ID Card** *(found in video)* — associate ID card with photo, ID number, rank, QR code (likely encodes referral/placement link)
11. **Support tickets** *(found in video)* — raise/track a support request
12. **Announcements feed** *(found in video)* — company-pushed updates
13. Messaging (inbox seen in nav)
14. Language toggle (English/Hindi) — cross-cutting, not a screen

### 5.2 Admin / Back-office
(extending the original list with back-office additions found in the video walkthrough)
1. Admin login (RBAC: super-admin, finance, KYC-reviewer, support)
2. Associate directory + profile drill-down
3. Tree explorer (full org visualization, anomaly flags)
4. Sales register (view/void/export)
5. Plot & inventory management (create projects, plots, pricing, availability status) — **new**: the video's colour-coded plot grid implies admins need a plot/inventory CRUD screen, not just associates viewing it
6. EMI/installment plan configuration per plot — **new**, implied by the EMI report screen
7. Cycle management (trigger/monitor/re-run settlement)
8. Compensation rules config (versioned — direct %, matching %, sponsor %, royalty table, reward tiers)
9. e-PIN generation/allocation (admin issues activation PINs to associates or upline) — **new**
10. Ledger/payout approval queue, including **withdrawal request approvals** — new, matching the associate wallet feature
11. KYC review queue
12. Support ticket queue — **new**
13. Announcement composer — **new**
14. Reports & exports (TDS summary, admin-charge revenue, rank distribution)
15. Audit log

### 5.3 Platform-level (super-admin, multi-tenant) — Superseded

*(Superseded — product decided single-tenant, see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`. This entire section assumed a multi-tenant SaaS platform with a platform super-admin onboarding multiple branded tenant companies; that persona and its features do not apply. The single "Company Admin / Finance" persona in §4 covers back-office needs for this one organization.)*

~~1. Tenant onboarding wizard (company profile, branding/logo, domain/subdomain)~~
~~2. Per-tenant compensation rule templates~~
~~3. Billing/subscription management for tenants~~
~~4. Cross-tenant system health dashboard~~

---

## 6. Data Model (delta from prior spec)

New/updated entities based on video findings:

- **Wallet** (associate_id, available_balance, last_updated)
- **WithdrawalRequest** (id, associate_id, amount, status: requested → under_review → approved/rejected → disbursed, requested_at, processed_at, bank_ref)
- **EPin** (id, code, status: unused/used, issued_to, issued_by, issued_at, used_at) — activation/top-up codes; needs generation, allocation, and redemption flows
- **Plot** (id, project_id, plot_no, type [normal/corner], area, rate, price, extra_price, status [available/booked/sold])
- **PlotBooking** (id, plot_id, associate_id/buyer, booking_date, total_price, paid_amount, rest_amount, EMI schedule ref)
- **EMISchedule** / **EMIPayment** (booking_id, installment_no, due_date, amount, paid_date, status)
- **SupportTicket** (id, associate_id, subject, status, assigned_to, thread)
- **Announcement** (id, title, body, published_at, audience) *(no `tenant_id` — see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`)*
- **IDCard** — likely generated on-demand (render, don't persist) from Associate + Rank + QR data

(All prior entities — Associate, Sale, LedgerEntry, Cycle, LegVolume — carry over as previously specified.)

---

## 7. Functional Requirements — key flows

### 7.1 Withdrawal flow
1. Associate views wallet balance (= sum of `payable` LedgerEntry.net_amount not yet withdrawn).
2. Associate submits WithdrawalRequest (must be ≥ configurable minimum, KYC must be verified).
3. Admin finance reviews queue, approves/rejects with reason.
4. On approval, Payout Service executes bank transfer, WithdrawalRequest → disbursed, wallet balance decremented.
5. All state transitions logged to audit log.

### 7.2 e-PIN flow
1. Admin (or upline, if self-serve top-up is allowed) generates a batch of e-PINs.
2. PIN is used at associate activation or plot top-up time; on redemption, marked `used`, linked to the transaction it unlocked.
3. Reporting: PIN issuance vs redemption reconciliation (finance needs this to trace revenue from activation fees).

### 7.3 Plot booking + EMI
1. Admin creates a Project, adds Plots with type/area/rate/price.
2. Associate (or admin on their behalf) books a plot for a buyer; system captures total price, initial paid amount, generates rest-amount schedule if EMI is selected.
3. Each EMI payment recorded against the booking; overdue installments should be visible in both associate and admin EMI reports.
4. Booking triggers a `Sale` record feeding into the compensation engine only once a **confirm date** is reached (the downline reports show separate Payment Date and Confirm Date columns — implies bookings aren't credited to compensation until confirmed, likely after some payment threshold or manual verification).

---

## 8. Non-Functional Requirements

(carried over + additions)
- Append-only ledger, idempotent cycle-close batch, KYC as hard payout gate, rule versioning, incremental leg-volume rollups — as previously specified.
- ~~**Multi-tenancy**: tenant_id on every table; row-level isolation; per-tenant branding (logo, colors, domain) driven by config, not code forks.~~ *(Superseded — product decided single-tenant, see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`. No `tenant_id` column exists on any table.)*
- **i18n**: all associate-facing strings externalized (English/Hindi minimum), not hardcoded.
- **Two-factor financial gating**: separate login password vs. transaction password, as observed in the app — apply this pattern to withdrawal requests and other money-moving actions.

---

## 9. Open Questions

1. Is plot **confirmation** (Payment Date vs Confirm Date) a manual admin action, an automatic threshold (e.g. X% paid), or KYC-gated? This determines whether "confirmed" sales can be reversed and how that interacts with already-paid commissions.
2. Can associates self-generate e-PINs (paying directly) or are PINs always admin-issued/pushed down from upline?
3. Withdrawal minimum threshold and frequency limits (once per cycle? anytime?) — needs a business decision.
4. Is the digital ID card purely cosmetic/marketing, or does its QR code drive the referral/placement flow programmatically?

---

## 10. Out of Scope / Future Considerations

- Public-facing plot marketplace for direct retail buyers.
- Automated legal/regulatory risk flagging.
- ~~Cross-tenant leaderboard/gamification.~~ *(Superseded — moot: product is single-tenant, see `docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`.)*
