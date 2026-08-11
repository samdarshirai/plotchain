---
name: Sales Register (Admin Operational Screen)
tokens:
  colors:
    surface-page: var(--surface-page)       # #f8f9ff — matches Stitch doc's `background`
    surface-card: var(--surface-card)       # #ffffff — matches Stitch doc's `surface-container-lowest`
    surface-raised: var(--surface-raised)   # #eff4ff — matches Stitch doc's `surface-container-low`
    border-subtle: var(--border-subtle)     # #c2c6d9 — matches Stitch doc's `outline-variant`
    text-primary: var(--text-primary)       # #0b1c30 — matches Stitch doc's `on-surface`
    text-muted: var(--text-muted)           # #424656 — matches Stitch doc's `on-surface-variant`
    brand-primary: var(--brand-primary)     # #7C3AED — tenant-configurable, see note below
    brand-secondary: var(--brand-secondary) # #22D3EE
    brand-gradient: var(--brand-gradient)
    brand-primary-soft: var(--brand-primary-soft)
    status-success: var(--status-success)   # #34D399
    status-warning: var(--status-warning)   # #F59E0B
    status-danger: var(--status-danger)     # #F87171
  typography:
    eyebrow: "'JetBrains Mono', monospace — 0.8125rem/500/uppercase/0.02em"
    operational-title: "'Geist', var(--font-sans) — 1.75rem/600/-0.01em"
    subtitle: "'Inter', var(--font-sans) — 1rem/400, color text-muted"
    field-label: "'JetBrains Mono', monospace — 0.75rem/500/uppercase/0.02em, color text-muted"
    body: "'Inter', var(--font-sans) — 0.875rem/400"
    ledger-data: "'JetBrains Mono', monospace — 0.875rem/600, tabular-nums"
  radius:
    card: 20px
    panel: 16px
    control: 8-12px
    pill: 999px
  spacing:
    row-gap: 1.5rem
    card-padding: 2rem
    field-gap: 1.5rem
  shadow:
    card: "0 4px 20px -2px rgba(0, 0, 0, 0.08)"
---

## Why this screen, why now

Every existing operational admin screen — Associate Directory, KYC Review Queue — ships today with **zero** screen-specific CSS: they're `.card` + a plain `<table class="editable-table">` and nothing else (confirmed directly from `frontend/src/app/admin/associate-directory/associate-directory.component.ts` and `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`, and from the fact that `_shared-components.scss`/`_settings.scss` have no `.associate-directory__*` or `.kyc-queue__*` rules). Sales Register is the first day-to-day operations screen to get a bespoke design pass, and this artifact is meant to set the pattern the next one (KYC Review, a future Cycle History screen) follows.

The only precedent in `docs/design/` is `stitch_premium_admin_setup_wizard/*` — mockups for the **setup wizard**, a different register entirely (onboarding, full-bleed, three-column, `Phase 04` step chrome, binary-placement visualizations). This design reuses that system's *tokens* (color/type/shape/spacing) but deliberately drops all of its wizard-specific chrome. Sales Register is something an admin opens dozens of times a day to check what sold and void a mistake — it should read as a **ledger**, not a **guided flow**.

## A note on the palette source of truth

The brief calls out that `stitch_premium_admin_setup_wizard/high_performance_enterprise/DESIGN.md`'s palette is "1:1 identical" to `frontend/src/styles/_tokens.scss` — that's true for the neutrals (`background`/`on-surface`/`on-surface-variant`/`surface-container-low`/`surface-container-lowest`/`outline-variant`), which is why the mapping table above cites them. It is **not** true for the accent/status colors: the Stitch doc's `primary: #004bca` and `error: #ba1a1a` are Tailwind-config leftovers from the Stitch-generated mockup and were never wired into `_tokens.scss` — the live app's actual accent is `--brand-primary: #7C3AED` (violet, tenant-configurable per `ThemeService`) and its actual danger color is `--status-danger: #F87171`. Confirmed by reading `create-associate.component.ts`'s CSS (`.create-associate__eyebrow { color: var(--brand-primary); }`) — the one screen that already implements this token system live. This design uses `--brand-primary`/`--status-*` throughout, never the Stitch doc's raw hex, per the "no new hex colors" constraint.

## Layout concept

```
┌ SALES · REGISTER  (eyebrow, mono, brand-primary)  ────────────────────┐
│ Sales Register                                    [+ Record Sale]    │  <- operational-title, 28px (not 32px hero)
│ Every recorded and voided plot sale, across every project.           │
├────────────────────────────────────────────────────────────────────┤
│ ┌ toolbar (surface-raised strip, 16px radius) ───────────────────┐  │
│ │ Associate ▾   Status ▾   Recorded From [ ]  Recorded To [ ]  Reset│
│ └──────────────────────────────────────────────────────────────┘  │
│ [ inline-banner tone=danger — load error, when present ]            │
│ [ inline-banner tone=danger — action error, when present ]          │
│ ┌ .card / .editable-table (ledger) ────────────────────────────┐  │
│ │ BUYER NAME | BUYER PHONE | AMOUNT | LEG | STATUS | RECORDED AT│Actions
│ │ ...rows, JetBrains Mono for numeric/status columns...          │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                    Page 2 of 6   [Prev] [Next]      │
└────────────────────────────────────────────────────────────────────┘
```

Why not the wizard's three-column shell: this screen already lives inside the real `SettingsShellComponent` (`frontend/src/app/settings/settings-shell.component.ts`) — a plain left nav rail + content column, no fixed header, no right inspector rail. Reproducing the wizard's `pl-72 pr-96` chrome here would be pure decoration that the live shell doesn't have room for and the content doesn't need. The design commits fully to the "dense ledger" register instead.

## Signature elements (the two things this screen is meant to be remembered by)

1. **Ledger typography on data columns.** Amount, Leg Credited, Status, and Recorded At all set in `'JetBrains Mono'` with `font-variant-numeric: tabular-nums` where numeric — this is the same utility face `_admin.scss` already reserves for "IDs, code snippets, precision," applied here to actual transaction data instead of labels. It's not decoration: a ledger of money and dates is exactly the content JetBrains Mono was chosen for system-wide, and lining up digits in a monospace face is what makes a column of amounts scannable at a glance.
2. **Directional Leg Credited values.** The "Leg Credited" column doesn't just say `LEFT`/`RIGHT` — the value string itself carries a glyph: `◂ LEFT` / `RIGHT ▸`. This ties the screen back into PlotChain's actual domain (binary compensation legs — the same L/R concept `create-associate`'s placement toggle uses) rather than reading as a generic status column. It's formatted at the data layer (`SalesRegisterComponent` mapping `Sale.legCredited` to the row string), not a new visual primitive.

## Component mapping (no new primitives)

Every interactive/feedback surface below maps onto one of the four allowed shared components. Nothing here needs a new component.

| Screen need | Component used | Notes |
|---|---|---|
| Register table + pagination shell | `EditableTableComponent` (`readOnly`) | Same usage shape as `AssociateDirectoryComponent`/`KycQueueComponent`. |
| RECORDED row inline void reason + Void button | `EditableTableComponent`'s single `actionTemplate` | Mirrors `KycQueueComponent`'s reject-reason `<ng-template>` exactly — text `<input>` plus a button, scoped per-row via `row.id`. |
| VOIDED row static tag + reason | Same `actionTemplate`, branched with `*ngIf="row.status === 'VOIDED'"` | See "Implementation constraint" below — this is the *only* place per-status color-coding is achievable. |
| Load error / void-action error banners | `InlineBannerComponent` tone="danger" | Upgrades `associate-directory__load-error`'s plain `<p>` to a real banner — this screen's bespoke pass includes fixing that predecessor's flat treatment, establishing the banner convention for future re-passes. |
| Record Sale submit / Record Another / Void | `BrandButtonComponent` (`primary`/`secondary`/`danger`) | `variant="danger"` for Void, matching the button's own danger token wiring to `--status-danger`. |
| Record Sale field errors | `FieldErrorComponent` | Same per-field pattern as `create-associate.component.ts`. |
| Record Sale success | `InlineBannerComponent` tone="success" containing a `BrandButtonComponent` (`secondary`) "Record Another" | Structurally identical to `create-associate`'s temporary-password banner (`<app-inline-banner tone="success"><p>...</p><app-brand-button variant="secondary">Done</app-brand-button></app-inline-banner>`), copy substituted for sale details and the action relabeled "Record Another" instead of "Done" since the form resets rather than closes. |

### Implementation constraint worth flagging

`EditableTableComponent`'s read-only data cells render `{{ row[column.key] }}` as plain text inside a `<span>` — there's no per-cell class hook, and its single `actionTemplate` input has no way to know *which* column invoked it, so only one column can realistically be `type: 'action'`. That means:
- The **Status** column (plain text, `type: 'text'`) can be styled uniformly (monospace, uppercase, muted) but **cannot** be colored per value (no green "Recorded" / red "Voided" pill) without extending the shared component — out of scope per this brief's "no new primitives" rule. The load-bearing visual distinction between RECORDED and VOIDED instead lives entirely in the **Actions** column, which does have full template control.
- The VOIDED "static tag" *can* be a real colored pill (`.sales-register__voided-tag`, `color-mix(in srgb, var(--status-danger) 16%, var(--surface-card))` background) because it's rendered inside the `actionTemplate`, not a plain data cell — same idiom `_shared-components.scss`'s `.checklist-row__badge` already uses.

### Mobile stacked-table prerequisite

The wizard system's Responsive Behavior section mandates that dense tables (naming Sales Register explicitly) collapse to one stacked card per row below `md` (768px), with each field shown as `label: value`. `EditableTableComponent`'s template does not currently emit a `data-label` attribute on its `<td>`s, which the CSS below depends on (`content: attr(data-label)` in the `::before`). This is a **one-line, backward-compatible addition** to the existing shared component (`[attr.data-label]="column.label"` on the `<td>`) — not a new primitive, just wiring an attribute the responsive CSS needs. Flagging it here so Task 7's implementer adds it rather than discovering the gap mid-build.

## Colors

| Use | Token |
|---|---|
| Page background | `--surface-page` |
| Card / table surface | `--surface-card` |
| Toolbar (filter bar) surface | `--surface-raised` |
| Borders, table rules | `--border-subtle` |
| Headings, primary data | `--text-primary` |
| Labels, secondary data, hints | `--text-muted` |
| Eyebrow, primary CTA, active states, focus ring | `--brand-primary` / `--brand-gradient` / `--brand-primary-soft` |
| Voided tag, danger banners, Void button | `--status-danger` |
| Success banner (Record Sale) | `--status-success` |

## Typography

Reuses the exact stack `_admin.scss`'s `.create-associate__*` rules already establish live:
- **Geist** — headings. This screen's H1 is set smaller than `create-associate__title` (1.75rem vs. 2rem) — a deliberate, not default, choice: `create-associate` is a hero "provision something new" moment that earns a bigger title; Sales Register is a list screen an admin scans dozens of times a day, so the title yields vertical space to the table.
- **Inter** — body copy, table cell values, form inputs.
- **JetBrains Mono** — eyebrow, field labels (unchanged from `create-associate`), *plus* an extension into ledger data columns (Amount/Leg/Status/Recorded At) and the Voided tag — the "signature" decision above.

## Shape, elevation, spacing

Reused verbatim from the live `.create-associate` rules (confirmed identical values in `_admin.scss`, not just described in the Stitch doc): 20px card radius, `0 4px 20px -2px rgba(0,0,0,0.08)` card shadow, 12px control radius, 1.5rem row gaps, 2rem card padding. The toolbar strip uses the 16px "panel" radius `create-associate__placement` already established for its `surface-raised` sub-panels.

## Responsive behavior

Breakpoints match the wizard DESIGN.md's addendum (Tailwind defaults: `md` 768px) where it names Sales Register explicitly, with one deviation: the multi-column form collapse point uses **720px**, matching `create-associate`'s own live `@media (max-width: 720px)` rule exactly (`_admin.scss` lines 278-288) rather than Tailwind's abstract 640px `sm` — consistency with the sibling create-flow that already ships this behavior outranks matching an unimplemented Tailwind token.

- **Below 768px — register table**: rows become one stacked card per row. Buyer Name is the card title (`ledger-data` mono weight); Buyer Phone/Amount/Leg/Status/Recorded At render as `label: value` pairs via `content: attr(data-label)` (see prerequisite above); Actions render full-width beneath.
- **Below 768px — toolbar**: filter fields stack full width, one per row; Reset moves to its own full-width row.
- **Below 720px — Record Sale form**: both `.record-sale__row` two-column grids collapse to one column, matching `create-associate__row`'s existing breakpoint.
- **Touch targets**: inputs/buttons inside the table's Actions cell and the toolbar get explicit `min-height: 44px` below 768px — the base 0.625rem/0.375rem paddings used at desktop density don't clear 44px on their own.

## Out of scope (per Part A of the implementation plan)

No CSV export control (no backend support yet). No associate-facing Sales History. No cycle-monitoring UI. No PAN/EMI/matching-royalty UI.
