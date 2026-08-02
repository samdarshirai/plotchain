# Spec: Admin Usage — Core Back-Office Screens

Status: Draft, approved by section during brainstorming — 2026-08-02

## 1. Scope

The setup wizard (company profile, branding, compensation plan, projects, payments/KYC config,
admin team, root associate, review & launch) is built. Associate creation
(`POST /api/associates`, the Create Associate form) is built. This spec covers the next layer:
the **ongoing admin back-office screens** an admin uses after go-live to actually run the
company day to day, per PRD §5.2.

PRD §5.2 lists ~15 admin areas. This spec covers only the three that are buildable against
today's schema:

- **Associate Directory** — search, filter, drill into any associate's profile, suspend/reactivate,
  reset password.
- **Tree Explorer** — visualize the binary tree, search a node, see leg volumes, anomaly flags.
- **KYC Review Queue** — approve/reject an associate's KYC status.

Plus the **RBAC enforcement** all three depend on.

**Explicitly out of scope** (deferred to later specs, each needs backend entities that don't
exist yet):

- **Sales Register** — needs a `Sale`/`PlotBooking` entity. The associate-facing plot-booking
  flow isn't built, so there's no sales data to register.
- **Ledger/Payout Approval, including withdrawal approvals** — needs a `WithdrawalRequest`
  entity. Only `WithdrawalConfig` (the settings knob for minimum amount / auto-approve
  threshold) exists today.
- **e-PIN generation/allocation, Support ticket queue, Announcement composer, Reports &
  exports** — none of these have supporting entities yet either; each becomes its own spec.

**Reviewed against the reference-app screen recording** (56 frames extracted via `ffmpeg`, one
every 5s, full runtime). Finding: the recording is entirely the associate-facing self-service
portal — no admin views appear anywhere in it, so it can't directly validate these three admin
screens. It's still useful as domain-vocabulary confirmation, reflected in §3 and §5 below.
Notable items it surfaced that are **out of scope for this spec but relevant to later ones**:
a separate transaction password (gates KYC/bank/e-PIN actions in the reference app, doesn't
exist anywhere in this codebase yet — not even the associate-facing side, which the
setup-onboarding spec already lists as a gap); KYC bundling a bank-passbook photo in with
PAN/Aadhar as one 4-document submission; and a recurring DataTables-style export toolbar
(search, CSV/Excel/PDF/print, column toggle) worth matching for UI consistency once these
screens get built.

## 2. RBAC

`AssociateRole` already has `ADMIN, ASSOCIATE, SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT`.
Today every admin-family role shares one "may write" authority
(`AssociateRole.isAdminFamily()`) — `AdminRolePermissions.java` documents an intended per-role
matrix but nothing enforces it yet (its own Javadoc calls this out as a named follow-up). This
spec is that follow-up, scoped to the three new screens only — existing endpoints keep their
current blanket rule, no regression risk to already-shipped flows.

**ADMIN and SUPER_ADMIN are equivalent** — both get full access everywhere. `ADMIN` is simply
how the first account was bootstrapped (`AdminBootstrapRunner`); it carries no powers beyond
that origin.

| Action | SUPER_ADMIN / ADMIN | FINANCE | KYC_REVIEWER | SUPPORT |
|---|---|---|---|---|
| View Associate Directory / profile drill-down | ✅ | ✅ | ✅ | ✅ |
| Suspend / reactivate associate | ✅ | ❌ | ❌ | ❌ |
| Reset associate password | ✅ | ❌ | ❌ | ❌ |
| View Tree Explorer | ✅ | ✅ | ✅ | ✅ |
| View KYC queue | ✅ | ✅ | ✅ | ✅ |
| Approve/reject KYC | ✅ | ❌ | ✅ | ❌ |

This matches `AdminRolePermissions`'s existing documented grants (KYC_REVIEWER: "Review KYC
submissions, Approve/reject documents"; FINANCE/SUPPORT: view-only on associate data).

## 3. Associate Directory

New endpoints in the existing `associate` package (owns `Associate` already).
`GET /api/associates` (unpaginated, `{id, userId, name}` only) stays as-is — it's the
parent-picker on the Create Associate form and other code may depend on that exact shape.

| Endpoint | Access | Notes |
|---|---|---|
| `GET /api/admin/associates?search=&rank=&kycStatus=&status=&joinedFrom=&joinedTo=&page=&size=` | all admin-family | search by name/userId; page-response shape matches `PlotPageResponse`/`SettingsAuditPageResponse` |
| `GET /api/admin/associates/{id}` | all admin-family | full profile + direct/total downline counts (reuses `AssociateRepository.countDownline`) + current-cycle leg volumes; includes Sponsor ID (`sponsorId`) and Placement ID (`parentId` + `position`) — both already exist on `Associate`, and the reference app's genealogy tables treat them as standard directory columns |
| `POST /api/admin/associates/{id}/suspend` | SUPER_ADMIN/ADMIN | sets new `status` column to `SUSPENDED`; blocks login |
| `POST /api/admin/associates/{id}/reactivate` | SUPER_ADMIN/ADMIN | sets `status` back to `ACTIVE` |
| `POST /api/admin/associates/{id}/reset-password` | SUPER_ADMIN/ADMIN | reuses `TemporaryPasswordGenerator`; sets `must_change_password=true`; returns the temp password once, never stored/retrievable after |

### Data model delta

`Associate` gets a new column: `status ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'`.
`AuthenticationService`'s login check gets a `status == SUSPENDED` branch alongside its existing
`must_change_password` check.

Note: this `status` is about login access (admin-imposed), distinct from "active/inactive team"
in the PRD/reference app, which is a date-range-computed business-activity measure (already
served by `AssociateRepository.countActiveToday` against `lastActiveAt`, no schema change). Two
different concepts sharing similar names — worth keeping the naming distinction clear in the UI
(e.g. "Account suspended" vs. an "Inactive" business-activity badge) so they don't read as the
same thing.

All four mutating actions call `SettingsAuditService.record("associate", summary, detail,
actorId)` — reuses the existing append-only audit trail, surfaces in the same Audit Log screen
built for Company Settings.

## 4. Tree Explorer

New `tree` package — no existing owner, spans `Associate` + `LegVolume`, read-only for v1 (no
re-placement; correcting a mis-placed associate is high-risk to compensation history and is its
own later spec).

| Endpoint | Access | Notes |
|---|---|---|
| `GET /api/admin/tree/{associateId}?depth=N` | all admin-family | subtree from any node, depth-limited so the UI expands on click rather than loading the whole org at once; each node returns id/userId/name/rank/kycStatus/position + current-cycle leg volumes |
| `GET /api/admin/tree/search?q=` | all admin-family | find a node by name/userId; returns its ancestor path so the UI can jump straight to it |

### Anomaly flags (computed, not stored)

Two rules for v1, both hardcoded constants (not admin-configurable — can become a settings
field later if tuning turns out to matter):

- **Skewed legs**: both legs non-zero this cycle, and `max(left, right) / min(left, right) ≥
  10`.
- **Stagnant**: `joined_at` ≥ 90 days ago and zero direct downline.

## 5. KYC Review Queue

Status-only for v1 — no document viewer. There's no PAN/Aadhaar capture or document
upload/storage built yet (only the required-doc-types *config* from setup exists,
`payments/KycConfig`); building real document review means building associate-facing KYC
submission first, which is out of scope here. Added to the `associate` package (mutates
`Associate.kycStatus`, same owner).

| Endpoint | Access | Notes |
|---|---|---|
| `GET /api/admin/kyc?status=PENDING&page=&size=` | all admin-family | defaults to `PENDING`, filterable by any `KycStatus`; FINANCE needs visibility since KYC gates payouts |
| `POST /api/admin/kyc/{associateId}/decision` | SUPER_ADMIN/ADMIN/KYC_REVIEWER | body `{decision: VERIFIED\|REJECTED, reason}`; `reason` required when `REJECTED`, optional when `VERIFIED` |

Decision calls `SettingsAuditService.record("kyc", summary, detail, actorId)` with the reason in
`detail`. A rejected associate isn't permanently locked out of KYC — status can move
`REJECTED → VERIFIED` later (a fresh audit entry, no separate "resubmission" state needed since
there's no document to resubmit in this status-only version).

## 6. Frontend

New components under `frontend/src/app/admin/`, alongside the existing `admin.guard.ts` /
`admin.service.ts` / `create-associate.component.ts`:

- `associate-directory/` — paginated table (`editable-table` shared component), filter bar,
  `side-panel` for drill-down profile with suspend/reactivate/reset-password actions.
- `tree-explorer/` — expandable tree view, search box, anomaly badges on flagged nodes.
- `kyc-queue/` — `tab-bar` for status filter, `stat-tile` for queue counts, approve/reject
  action with a reason field on reject.

All three follow the existing `settings-shell`/`settings-nav-rail` pattern for admin-area
navigation rather than introducing a new shell.

## 7. Non-functional

- Every mutating endpoint requires a reason or is self-evident from its action (suspend/
  reactivate/reset-password don't need a reason field; KYC rejection does) — consistent with
  the existing settings audit pattern, which always logs actor + timestamp regardless.
- Pagination on directory and KYC queue from day one — no assumption about associate-count
  scale.
- Method-level access control (`@PreAuthorize` or an equivalent per-role check) is introduced
  for these new endpoints specifically; existing blanket-write endpoints are untouched.
