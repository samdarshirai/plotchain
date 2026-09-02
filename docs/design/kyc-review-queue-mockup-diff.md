# KYC Review Queue — visual/UI diff (mockup vs. real app)

Pure visual comparison: alignment, spacing/padding, indentation, typography, color,
border-radius — for the components that exist in **both** the mockup and the real
app, across all three tabs. Not a feature-parity audit (no missing-button/missing-field
items below).

> **Update:** 3 of the 5 deltas below are now fixed (stat-tile caption, reject-chip
> corners, Verified/Rejected badge position) — see **§6. Update: fixes applied**.
> The other 2 (eyebrow color, tab-bar shape) were left as-is: both are earlier
> deliberate decisions to diverge from this mockup, not oversights.

## Sources

| | |
|---|---|
| Mockup | Claude Design project `f13d1ecc-db19-472a-9e63-ba54e31d984a`, `KYC Review Queue.dc.html`, variant **1a**, viewed live via Present ▸ New tab (interactive — tabs/reject-drawer actually click) |
| Real app | `/settings/kyc-queue`, `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`, styled by `frontend/src/styles/_admin.scss` `.kyc-queue*` (from line 3171) |
| Method | Live click-through of both, all three tabs + the inline reject drawer; real-app numbers taken from the compiled SCSS (exact), mockup numbers from on-screen zoom inspection (cross-origin iframe blocked `getComputedStyle` on the mockup, so those are visual reads, not extracted values) |

---

## 1. Shared chrome (same on all three tabs)

| Component | Mockup | Real app | Diff |
|---|---|---|---|
| Eyebrow ("NETWORK / COMPLIANCE") | muted brown-gray | **oxblood** (`%admin-screen-eyebrow`) | Color differs — real app is more saturated/red. |
| Page title | Fraunces serif, black | same serif, same visual size (~28px) | No visible diff — sizes now line up. |
| "Last synced" stamp | mono, gray, right-aligned, baseline-aligned with title | identical treatment | Match. |
| Seal card (pending count) | double gold hairline border, oxblood `—— AWAITING REVIEW ——` flanking rule, large serif figure, "oldest pending N days" hint below | pixel-for-pixel same layout | Match. |
| Stat tiles (Verified/Rejected) | ~2px corner radius, bold ~30px value, small gray **"this cycle" caption inline after the number** on the same line | same 2px radius (`--radius-sm`) and ~30px value (`_admin.scss:3219`), **no caption** — just the number alone | Real app's tile is one line shorter (no trailing caption text) than the mockup's. |
| Tab bar container | **boxed**: bordered parchment-fill pill container wrapping all 3 tabs, ~20px gap before the table below | **flush**: no container/background, tabs sit directly on the page, zero gap into the table card | Different shape entirely, not just the active state — see §1.1. |
| Table card outer border | (part of the boxed-tab layout, floats below the gap) | starts immediately under the active tab with **square top-left corner only** (`border-radius: 0 var(--radius-sm) var(--radius-sm) var(--radius-sm)`), everywhere else 2px | Real app's card visually continues the active tab (no seam); mockup's card is a separate block below a gap. |
| Footer (summary + pagination) | one row, `space-between`, single top border | identical (`.kyc-queue__footer`, `_admin.scss:3522`) | Match. |

### 1.1 Tab bar detail

- **Mockup**: active tab ("Pending 3") is a **sharp-square-cornered** oxblood block sitting inside a rounded/bordered outer box alongside the inactive tabs (which have no visible background, just text on the box fill).
- **Real app**: active tab has **top-only 4px rounding** (`border-radius: 4px 4px 0 0`, `_admin.scss:3320`), inactive tabs are fully transparent (no shared container), and the active tab's bottom edge is flush with the table card directly beneath it — reads as "this tab opened this table," not a separate segmented control.

---

## 2. Pending tab

| Component | Mockup | Real app | Diff |
|---|---|---|---|
| Table header row | ALL-CAPS, letter-spaced, muted color, left-aligned (Actions column right) | identical (`0.06em` tracking, `_admin.scss:3356-3365`) | Match. |
| Row actions | **View / Reject / Approve** (3 buttons) | **Reject / Approve** (2 buttons) | Different button count changes the actions-column width/visual weight, though the two shared buttons (Reject/Approve) are styled the same on both — see next row. |
| Reject button | sharp square corners, thin oxblood/red outline, red text | same outline treatment, sharp corners (`.kyc-queue__reject-action`, `_admin.scss:3439`) | Match. |
| Approve button | sharp square corners, solid oxblood fill, bold gold text | same (`.kyc-queue__approve-action`, `_admin.scss:3447`) | Match. |
| Reject drawer placement | flush inside the table card, `border-top` only, between the last row and the footer | identical placement/border treatment (`_admin.scss:3457-3464`) | Match. |
| Reject drawer — reason chips | **sharp square corners** (0 radius); first chip ("Document unreadable") **pre-selected** (oxblood fill) by default | **2px rounded corners** (`--radius-sm`, `_admin.scss:3490`); **none selected** by default | Two diffs: corner radius (0 vs 2px), and default selection state (mockup opens with a chip already active, real app opens empty). |
| Reject drawer — free-text field | pre-filled with sample copy ("Aadhaar scan is cropped…") | empty, shows placeholder "Reason for rejection" | Real app starts blank; mockup shows it pre-populated. |
| Confirm rejection button | enabled-looking (solid, muted-rose) even with nothing explicitly chosen in a fresh drawer | visibly **disabled** (50% opacity, `.kyc-queue__reject-confirm:disabled`, `_admin.scss:3515`) until a chip or text is entered | Different default visual state. |

---

## 3. Verified tab

Real app columns: **Associate ID / Name / Joined / Status** (badge, right-aligned).
Mockup columns: **Associate ID / Name / Verified On / Verified By / Actions** (badge sits inline right next to the Name, not in its own column).

| Component | Mockup | Real app | Diff |
|---|---|---|---|
| Status badge | small bordered/tinted pill, sits **inline immediately after the associate's name** | small bordered/tinted pill (`.editable-table__badge--success`, olive-green), sits in its **own right-aligned trailing column** | Same pill *style* (both bordered, tinted, small caps-ish text), completely different *position* in the row. |
| Column count / grid | 5 columns | 4 columns (fixed `160px minmax(0,1.6fr) 200px minmax(0,1fr)` grid, `_admin.scss:3351`) | Real app's grid is narrower/simpler — no 5th column, so overall row rhythm (where each piece of text lands horizontally) doesn't match the mockup at all on this tab. |

---

## 4. Rejected tab

Real app columns: **Associate ID / Name / Joined / Status** (badge, right-aligned) — identical shape to the Verified tab.
Mockup columns: **Associate ID / Name / Rejected On / Reason / Actions** (badge inline after Name, plus a right-aligned **Re-open** button styled like Approve — solid oxblood, bold gold text, sharp corners).

| Component | Mockup | Real app | Diff |
|---|---|---|---|
| Status badge | inline pill next to Name, red/tinted | right-column pill (`.editable-table__badge--danger`, brick-red), same visual pill styling | Same pill style, different position (same delta as §3). |
| Row layout | 5 columns incl. a reason column and a Re-open action button | 4-column grid, no action button on this tab | Structural mismatch — real app's Rejected row is visually just the Verified row with a red badge instead of green; the mockup's is a distinct, denser row. |

---

## 5. Summary

Everything under **§1 "Shared chrome"** except the tab-bar shape and the stat-tile
caption is already visually matched — a prior pass closed most typography/spacing/
color deltas (radius tokens, button shapes, header caps, mono columns, badge pills,
footer row). What's still visually open, purely as UI/alignment/spacing (not feature
gaps):

1. Eyebrow color (oxblood vs. mockup's gray). **Kept as-is** — repo-wide convention across all 15 admin screens (settings-parity spec).
2. Tab bar: boxed segmented control (mockup) vs. flush tabs seated on the table card (real app). **Kept as-is** — KYC-queue's own prior, deliberate choice (commits `dbfa687`/`ac88d2c`), to read differently from Projects & Plots' boxed tabs.
3. Stat tile "this cycle" caption present in mockup, absent in real app. **Fixed** — see §6 (worded "all time", not "this cycle": `/counts` is an all-time total, not per-cycle).
4. Reject-drawer chips: 0px corners in the mockup vs. 2px in the real app. **Fixed** (corners only — the real app still opens with nothing pre-selected, since Confirm-disabled-until-a-reason-exists is a deliberate validation guard, not a visual gap).
5. Verified/Rejected tabs: badge sits inline next to the name in the mockup vs. in its own right-aligned column in the real app. **Fixed** — see §6.

---

## 6. Update: fixes applied

- **Stat tile caption** (`kyc-queue.component.ts`, `_shared-components.scss` unchanged, `_admin.scss` `.kyc-queue__stats .stat-tile__body`): `<app-stat-tile>` already had a `hint` input, unused here — wired it up, and scoped the shared `stat-tile__body` column-flex to wrap so label takes its own row and value+hint share the next one, inline. Worded "all time" rather than the mockup's "this cycle" (the backing `/api/admin/kyc/counts` is an all-time count).
- **Reject-drawer chips** (`_admin.scss` `.kyc-queue__chip`): `border-radius` `var(--radius-sm)` → `0`, matching the mockup's sharp corners. Every other kyc-queue control still uses the token; this one control deliberately doesn't.
- **Verified/Rejected badge position** (`kyc-queue.component.ts`, `editable-table.component.ts`, `_admin.scss`): added an optional `badgeKey` to `EditableTableColumn` (opt-in, other consumers unaffected) so a text column can carry an inline badge sourced from another row field. KYC queue's Name column now carries the status pill this way on Verified/Rejected, and no longer pushes a separate Status column — the row grid drops to 3 columns on those two tabs (`.kyc-queue--compact-table` modifier class), Joined stretching to fill the freed width. Fixed a related latent bug while in there: the trailing-column right-align rule was keyed off `th:last-child`, which would have force-right-aligned Joined once it became the actual last column — changed to a positional `th:nth-child(4)` so it only ever fires on the Pending tab's 4-column row.
- Unit test updated (`kyc-queue.component.spec.ts`) for the new column shape; `ng build` and the kyc-queue/editable-table spec suites (45 tests) pass.
