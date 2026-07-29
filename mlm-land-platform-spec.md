# Binary MLM Land-Sales Platform — Technical Spec

## 1. Overview

A platform for land-selling companies to manage a network of associates who sell plots and recruit sub-associates in a binary (2-leg) structure, with automated calculation of multi-tier commissions, rank progression, KYC-gated payouts, and admin oversight.

**Core entities:** Associate, Binary Tree, Sale, Income Ledger, Cycle (payout period), KYC Record, Reward/Rank Tier.

---

## 2. Domain Model

### 2.1 Associate
| Field | Type | Notes |
|---|---|---|
| associate_id | UUID | PK |
| sponsor_id | UUID | who recruited them (for sponsor bonus) |
| parent_id | UUID | binary tree placement parent |
| position | ENUM(L,R) | which leg under parent |
| rank | ENUM | Sales Associate → Sales Executive → ... |
| kyc_status | ENUM(pending, verified, rejected) | gates payouts |
| pan_number | encrypted string | affects admin charge % |
| aadhaar_number | encrypted string | |
| joined_at | timestamp | |
| activation_fee_paid | boolean | ₹1,100 gate |

### 2.2 Sale
| Field | Type | Notes |
|---|---|---|
| sale_id | UUID | PK |
| plot_amount | decimal | |
| associate_id | UUID | who sold it |
| buyer_details | JSON/ref | |
| leg_credited | ENUM(L,R) | which leg of the *placement chain* this rolls up into, per ancestor |
| cycle_id | UUID | which settlement cycle it belongs to |
| recorded_at | timestamp | |

### 2.3 LedgerEntry (append-only, never mutated)
| Field | Type | Notes |
|---|---|---|
| entry_id | UUID | PK |
| associate_id | UUID | beneficiary |
| income_type | ENUM(direct, matching, sponsor_matching, royalty, reward, perk) | |
| cycle_id | UUID | |
| gross_amount | decimal | |
| tds_deduction | decimal | 2% |
| admin_deduction | decimal | 5% or 15% (no PAN) |
| net_amount | decimal | |
| source_ref | UUID | sale_id or child ledger_id it derives from |
| status | ENUM(pending, carried_forward, paid, reversed) | |
| created_at | timestamp | immutable |

### 2.4 Cycle
| Field | Type | Notes |
|---|---|---|
| cycle_id | UUID | |
| period_start / end | date | 1st–15th / 16th–30th |
| status | ENUM(open, calculating, closed, paid) | |

### 2.5 LegVolume (materialized rollup — critical for performance)
| Field | Type | Notes |
|---|---|---|
| associate_id | UUID | |
| cycle_id | UUID | |
| left_leg_volume | decimal | sum of all descendant sales in L subtree |
| right_leg_volume | decimal | sum of all descendant sales in R subtree |
| carried_forward_left | decimal | unmatched excess from prior cycles |
| carried_forward_right | decimal | |

---

## 3. Compensation Engine Logic

Run once per cycle close (batch job), bottom-up over the tree:

1. **Direct Income** — computed immediately on `SaleRecorded`: `plot_amount × 6%`, credited to the selling associate. No tree traversal needed.

2. **Leg volume rollup** — for every associate, sum descendant sales per leg (this cycle's new volume + carried-forward volume from prior cycles).

3. **Matching Income** — `min(left_leg_volume, right_leg_volume) × 7%`. The matched amount is consumed; the excess on the larger leg is written to `carried_forward_{left|right}` for next cycle. This must process **leaf-to-root** since a parent's leg volume depends on children's totals.

4. **Sponsor Matching Bonus** — for each associate, `11% × (matching income of each direct sponsee)`. Requires sponsees' matching income to be finalized first — process this as a second pass after step 3 completes for the whole tree.

5. **Royalty Bonus** — `matched_pair_volume × royalty_%`, where royalty_% is looked up from a rank-based table (not fixed — varies by achieved level).

6. **Reward/Rank Income** — evaluate cumulative matched-pair volume against rank thresholds (Level 1/2/3...); award fixed bonus + perks for newly-crossed thresholds only (don't re-award). Remaining volume beyond a threshold carries forward toward the next rank.

7. **Deductions** — apply TDS (2%) and admin charge (5%, or 15% if no PAN) to every ledger entry's gross amount to get net_amount.

8. **KYC gate** — entries stay `pending` regardless of calculation; only flip to `payable` once `kyc_status = verified`.

**Idempotency:** the whole per-cycle run must be safely re-runnable (e.g. on failure/retry) without double-crediting — use `(associate_id, cycle_id, income_type, source_ref)` as a uniqueness constraint on LedgerEntry.

---

## 4. System Architecture

```
┌─────────────┐      ┌──────────────┐      ┌───────────────────┐
│ Associate   │      │  Sales API   │      │   Kafka: sales-    │
│ / Admin App ├─────▶│  (Spring     ├─────▶│   events topic     │
└─────────────┘      │   Boot)      │      └─────────┬──────────┘
                      └──────────────┘                │
                                                       ▼
                                          ┌────────────────────────┐
                                          │ Direct Income Consumer │
                                          │ (real-time, per sale)  │
                                          └────────────────────────┘

Cycle close (scheduled, e.g. Quartz/K8s CronJob):
┌────────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ Leg Volume Rollup   │──▶│ Matching Engine  │──▶│ Sponsor + Royalty  │
│ Batch Job           │   │ (leaf→root pass) │   │ + Reward Batch     │
└────────────────────┘   └──────────────────┘   └────────────────────┘
                                                       │
                                                       ▼
                                          ┌────────────────────────┐
                                          │ Payout/Settlement Svc  │
                                          │ (deductions, KYC gate, │
                                          │  gateway integration)  │
                                          └────────────────────────┘
```

**Services:**
- **Sales Service** — records sales, emits events.
- **Tree Service** — manages placement, exposes ancestor/descendant queries (cache leg-volume rollups in Postgres materialized views or a Redis-backed structure for read-heavy tree lookups).
- **Compensation Engine** — the batch calculator described above; stateless, replayable from ledger + sales data.
- **KYC Service** — PAN/Aadhaar verification (likely third-party API integration), stores verification status.
- **Payout Service** — deduction logic, ledger finalization, payment gateway/bank transfer integration.
- **Notification Service** — SMS/email/push for income credited, KYC pending, rank achieved.
- **Admin/Reporting Service** — dashboards, exports, manual adjustment workflows (with audit log).

**Storage:** Postgres (transactional core — associates, sales, ledger), Redis (leg-volume cache, session), object storage (KYC document uploads), Kafka (event backbone + audit trail of all sale/income events).

---

## 5. Screens

### 5.1 Associate-facing App (mobile-first)

| Screen | Purpose | Key elements |
|---|---|---|
| **Login / OTP** | Auth | Phone/OTP, referral-code capture on first signup |
| **Onboarding & KYC** | Collect PAN/Aadhaar, pay ₹1,100 activation fee | Document upload, status (pending/verified/rejected), payment gateway |
| **Dashboard / Home** | At-a-glance summary | Current rank, this-cycle direct/matching/total income, next rank progress bar, pending KYC banner |
| **My Tree** | Visualize binary downline | Interactive tree (L/R), tap a node for that associate's sales volume, search by name/ID |
| **Sales / New Sale** | Record or view a plot sale | Plot details form (amount, buyer info, KYC doc for buyer), sale history list with status |
| **Income Statement** | Itemized breakdown per cycle | Tabs: Direct / Matching / Sponsor / Royalty / Reward; each row shows gross, deductions, net; filter by cycle |
| **Payout History** | Past settlements | Cycle, amount paid, TDS/admin deducted, bank reference, downloadable statement (PDF) |
| **Rewards & Perks** | Track milestone rewards | Achieved rewards (smartwatch, trips) + progress to next tier with carry-forward volume shown |
| **Refer / Invite** | Add new associate to tree | Choose placement leg (L/R), generate referral link/code, pending-invite list |
| **Profile & Bank Details** | KYC docs, bank account for payout, PAN update | Editable fields with re-verification triggers |
| **Notifications** | Income credited, KYC status changes, rank-up alerts | List view |

### 5.2 Admin / Back-Office Panel (web)

| Screen | Purpose | Key elements |
|---|---|---|
| **Admin Login (RBAC)** | Role-gated access | Roles: super-admin, finance, KYC-reviewer, support |
| **Associate Directory** | Search/manage associates | Filters by rank, KYC status, join date; drill into individual profile |
| **Tree Explorer** | Full org visualization | Search any node, view leg volumes at any level, detect anomalies (e.g. abnormally skewed legs) |
| **Sales Register** | All recorded sales | Filter/export by date, associate, cycle, amount; flag/void a sale (with audit reason) |
| **Cycle Management** | Trigger/monitor cycle close | Status of current cycle (open/calculating/closed/paid), manual re-run with reason logging, view batch job logs |
| **Compensation Rules Config** | Adjust plan parameters | Direct %, matching %, sponsor bonus %, royalty table by rank, reward thresholds — versioned so historical cycles aren't affected by later changes |
| **Ledger / Payout Approval** | Review before disbursal | Pending payouts list, KYC-blocked list, bulk approve/hold, manual adjustment with mandatory audit note |
| **KYC Review Queue** | Verify submitted documents | Document viewer, approve/reject with reason, re-submission tracking |
| **Reports & Exports** | Compliance & finance reporting | TDS summary (for tax filing), admin-charge revenue, rank distribution, cycle-over-cycle growth |
| **Audit Log** | Full traceability | Every manual override, rule change, and reversal with actor + timestamp |

---

## 6. Non-Functional Requirements

- **Audit trail everywhere** — ledger entries are append-only; corrections are reversal + new entry, never edits. This matters both for internal trust and for any regulatory audit of the payout structure.
- **Idempotent batch processing** — cycle-close must be safely re-runnable.
- **KYC/PAN as a hard gate** on payouts, not just a UI warning.
- **Rule versioning** — compensation % and reward thresholds must be tied to the cycle they applied in, so changing them going forward never rewrites historical payouts.
- **Scale consideration** — leg-volume rollups should be incremental (update on sale, not full recompute) once the tree gets large; a naive recursive query per cycle close will not scale past a few thousand nodes.
