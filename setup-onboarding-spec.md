# Spec: Company Setup & Onboarding Screens

Scope: this is a **single-tenant** deployment — one company running its own instance, not a multi-tenant platform onboarding outside businesses. "Setup" here means the founding admin configuring their own instance before associates start using it, plus the ongoing "Company Settings" screens they return to afterward. No public sign-up, no email/OTP verification loops — the admin already has direct access to the server/deployment, so identity is established by them simply being logged into the admin panel.

---

## Wizard Principles

- **Save-and-resume**: every step persists on blur/next — admin can close the tab and come back; nothing is lost.
- **Non-blocking order, blocking launch**: steps can mostly be done in any order (a returning admin can jump to any completed or unlocked step), but **Launch is gated** — Company Profile, Compensation Plan, and Payments & KYC must be complete before "Go Live" is enabled. Branding, Projects, Admin Team, and Root Associate can be finished after go-live.
- **Live preview where it matters**: branding and compensation changes show an immediate preview (login page mock, sample payout calculation) so a non-technical admin can sanity-check before saving.
- **No verification loops**: no OTP on phone numbers, no email confirmation links, no "pending invite" state for admin accounts. Fields are captured as plain records; the admin creating them is trusted since they're already inside the authenticated setup area.
- **Everything here is reconfigurable later** from Company Settings — onboarding isn't a one-time form, it's the first visit to the same settings screens.

---

## Step 1 — Company Profile

| Field | Type | Validation |
|---|---|---|
| Company (display) name | text | required |
| Legal entity name | text | required |
| Registration / GST number | text | format-checked, optional if not yet registered |
| Primary contact name | text | required |
| Contact phone | phone | required, format-checked only — no OTP |
| Contact email | email | required, format-checked only — no verification link |
| Registered address | multi-line | required |

State: **Incomplete** (blocks launch) → **Complete**. No dependencies.

---

## Step 2 — Branding

| Field | Type | Notes |
|---|---|---|
| Logo upload | image | square + wide variant, auto-generates favicon |
| Primary color | color picker | drives buttons, nav, links |
| Secondary/accent color | color picker | drives highlights, badges |
| Tagline | text | shown under logo on associate login (e.g. "Empowering Visions") |

**Live preview panel**: renders the actual associate login screen with the chosen logo/colors/tagline in real time as the admin edits.

*Note: domain/URL is an infrastructure concern (set wherever this is deployed), not a setup-screen field — if referral links ever need the domain, the app should read it from the request host at runtime, not from an admin-entered value.*

State: optional for launch, but recommended-first since every later screen's preview uses it.

---

## Step 3 — Compensation Plan

The highest-stakes screen — mistakes here are expensive and hard to unwind mid-cycle.

| Field | Type | Notes |
|---|---|---|
| Direct income % | percent | applied to a solo sale |
| Matching income % | percent | applied to matched-pair volume |
| Sponsor matching bonus % | percent | applied to a direct sponsee's matching income |
| Royalty bonus table | table (rank → %) | add/edit rows per rank |
| Reward tiers | table (level → volume threshold → cash + perk description) | ordered, no gaps allowed |
| Settlement cycle | select | 15th/30th (semi-monthly) / monthly / custom |
| TDS % | percent | |
| Admin charge % (with PAN) | percent | |
| Admin charge % (without PAN) | percent | |
| Activation / e-PIN fee | currency | one-time fee to activate a new associate |
| Minimum withdrawal amount | currency | gates the wallet withdrawal flow |

**Live calculation preview**: a small "if an associate sells ₹10L on each leg, they'd earn ₹X" sample calculation that recomputes as the admin types — this is the single most important UX affordance on this screen, since these are otherwise abstract percentages.

**Versioning notice**: an inline banner explains "Changes here apply to future cycles only — past payouts are never recalculated," so the admin understands edits are safe after launch.

State: **required for launch**.

---

## Step 4 — Projects & Plots (optional at launch)

| Field | Type | Notes |
|---|---|---|
| Project name | text | e.g. "Vardhani Enclave" |
| Project location | text/map pin | |
| Plot entry mode | toggle | Manual single-entry vs. Bulk CSV upload |
| Per-plot fields (manual) | plot no., type (normal/corner), area, rate, price | |
| CSV upload | file | template download provided; validates rows, shows per-row errors before commit |

State: can be skipped entirely at launch and completed post-go-live from Company Settings → Projects.

---

## Step 5 — Payments & KYC

| Field | Type | Notes |
|---|---|---|
| Payment gateway | select + credentials | for collecting plot payments |
| Payout/disbursement bank account | bank details | for paying associates |
| KYC requirement | toggle (should default ON, cannot be fully disabled — only "strict/relaxed" document set configurable) | |
| Required KYC documents | multi-select | Aadhaar, PAN, bank passbook, etc. |
| Withdrawal approval mode | select | Auto-approve under ₹X / Always manual review |

State: **required for launch** (the company cannot go live without a way to collect money or pay associates).

---

## Step 6 — Admin Team & Roles

No email invites, no OTP — the founding admin creates each staff account directly with a User ID and a temporary password (shared with the staff member out-of-band, e.g. verbally or over a call), similar to how associate accounts are created.

| Field | Type | Notes |
|---|---|---|
| User ID | text | chosen by the creating admin, uniqueness-checked live |
| Full name | text | required |
| Temporary password | text (masked, with "generate" button) | admin can type one or auto-generate; staff member is forced to change it on first login |
| Role | select | Finance, KYC Reviewer, Support, Super-Admin |
| Role permission matrix | read-only table | shows what each role can/can't do, for the creating admin's clarity |

State: optional at launch (the founding admin can act as all roles until more accounts are created), but strongly prompted. No "pending" state exists — an account is either created (active) or doesn't exist yet.

---

## Step 7 — Root Associate(s)

Seeds the top of the binary tree — someone has to exist before referral placement makes sense.

| Field | Type | Notes |
|---|---|---|
| Root associate name/phone | text | |
| Auto-generated Associate ID | read-only | shown once created |
| Left/Right seed (optional second root) | toggle | some companies seed both legs with a founding pair |

State: optional at launch, but blocks the referral/placement flow until at least one exists — the wizard flags this clearly rather than hard-blocking.

---

## Step 8 — Review & Launch

- Read-only summary of all 7 steps, each with an "Edit" shortcut back to that step.
- Checklist showing which required steps are ✅ complete vs ⛔ blocking.
- Terms acceptance checkbox (platform terms of service).
- **Go Live** button — disabled until all blocking steps are ✅.
- On activation: the instance flips from "setup mode" to live, and the associate login becomes usable. No confirmation email step — the admin sees the status change immediately on this screen.

---

## Post-Launch: Company Settings

Same screens as the wizard, reorganized as a persistent settings area (not a linear flow):
- Company Profile
- Branding
- Compensation Plan *(with the same versioning safeguard — edits only affect future cycles)*
- Projects & Plots (full CRUD, not just initial setup)
- Payments & KYC
- Admin Team & Roles
- Audit Log of all settings changes (who changed what, when — critical given money is involved)
