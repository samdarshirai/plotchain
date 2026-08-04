---
name: High-Performance Enterprise
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#424656'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#737687'
  outline-variant: '#c2c6d9'
  surface-tint: '#0052dc'
  primary: '#004bca'
  on-primary: '#ffffff'
  primary-container: '#0061ff'
  on-primary-container: '#f1f2ff'
  inverse-primary: '#b4c5ff'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e2'
  on-secondary-container: '#646464'
  tertiary: '#9d3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#c73f00'
  on-tertiary-container: '#ffefeb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dbe1ff'
  primary-fixed-dim: '#b4c5ff'
  on-primary-fixed: '#00174b'
  on-primary-fixed-variant: '#003ea8'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c6'
  on-secondary-fixed: '#1b1b1b'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59d'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#832700'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '600'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  gutter: 24px
  margin-page: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

This design system is built for high-velocity B2B SaaS platforms where clarity, performance, and precision are paramount. The aesthetic merges the utilitarian rigor of developer tools with the polished elegance of premium fintech interfaces. 

The style is **Modern Minimalist with Tonal Depth**, characterized by:
- **Spatial Logic:** Using whitespace and proximity rather than heavy borders to define relationships.
- **Materiality:** Soft, diffused shadows and subtle gradients that suggest a physical stack of surfaces.
- **Precision:** Tight alignment and a systematic approach to typography that evokes a sense of reliability and technical excellence.
- **Focus:** High-contrast focal points against neutral backdrops to guide user workflows without visual noise.

## Colors

The palette is engineered for professional endurance, reducing eye strain while maintaining a clear information hierarchy.

- **Primary (Electric Blue):** Used for primary actions, progress indicators, and active states. It provides the "Stripe-like" energy against the neutral base.
- **Surface Scale:** We utilize a "Zinc" scale for neutrals. Pure white (#FFFFFF) is reserved for the highest level of the Z-axis (cards/modals), while a soft gray (#F8FAFC) defines the background canvas.
- **Typography:** Text uses a deep slate (#0F172A) for headings to ensure maximum legibility and a muted slate (#64748B) for secondary metadata.
- **Accents:** High-contrast black is used for global navigation and "Power User" actions to anchor the layout.

## Typography

The typographic system prioritizes scan-rate and hierarchy. 

- **Geist (Headings):** Selected for its technical, sharp aesthetic and compact tracking. It should be used for all primary UI headers and section titles.
- **Inter (Body):** The workhorse for all interface text, descriptions, and inputs. It provides a familiar, approachable feel that balances the technicality of Geist.
- **JetBrains Mono (Data/Labels):** Used sparingly for status badges, IDs, code snippets, and "Saved" indicators in the footer. This adds a layer of "engineered" precision to the design.

## Layout & Spacing

The design system utilizes a **Structured 3-Column Wizard** layout for complex workflows:
1.  **Global Navigation (Left):** Narrow, icon-heavy or collapsed sidebar.
2.  **Contextual Pane (Center):** The primary workspace or form area.
3.  **Inspector/Summary (Right):** Real-time feedback, help text, or data visualization.

**Grid Logic:**
- A 12-column fluid grid is used within the main content area.
- Gutters are fixed at 24px to ensure breathing room between technical data points.
- Vertical rhythm follows a 4px baseline, with standard component gaps of 16px (stack-md).
- On mobile, the 3-column structure collapses into a single vertical stack with the Summary pane becoming a floating action drawer.

## Elevation & Depth

This system moves away from borders and instead uses **Tonal Elevation** and **Soft Ambient Shadows** to define hierarchy.

- **Level 0 (Canvas):** The base background (#F8FAFC). No shadows.
- **Level 1 (Cards/Panels):** Pure white (#FFFFFF) with a very soft, large-radius shadow: `0 4px 20px -2px rgba(0,0,0,0.05)`.
- **Level 2 (Modals/Popovers):** Pure white with a more pronounced shadow and a 1px subtle inner stroke of #E2E8F0 to define the edge against other white surfaces.
- **Hover States:** Elements should subtly lift via a shadow transition rather than changing background color, creating a tactile "physical" feel.

## Shapes

The shape language is generous and friendly, softening the technical nature of the B2B content.

- **Standard Elements:** Buttons, inputs, and small widgets use a 0.5rem (8px) radius.
- **Container Elements:** Cards and main content panels use a 1.25rem (20px) radius to create the "premium" SaaS look characteristic of modern dashboard design.
- **Progress Bars:** Use fully pill-shaped (rounded-full) containers for a fluid, non-blocking appearance.

## Components

- **Modern Cards:** No borders. Background is #FFFFFF. Elevation is Level 1. Content padding should be generous (24px or 32px).
- **Primary Buttons:** High-contrast black or vibrant primary blue. Text is Inter Medium. Subtle inner glow for a "pressed" effect.
- **Input Fields:** Soft gray background (#F1F5F9) that transitions to White with a Primary Blue glow on focus. No heavy outlines.
- **Sticky Footer (Status Bar):** A fixed, bottom-docked element with a slight backdrop blur (Glassmorphism). It contains the "Saved" status in `label-mono` and primary workflow navigation.
- **Progress Indicators:** Thin, high-contrast lines at the very top of the viewport or subtle "step" circles with micro-animations on transition.
- **Chips/Badges:** Monospaced text in JetBrains Mono, using a semi-transparent fill of the status color (e.g., subtle green for "Success").
## Responsive Behavior

The reference screens in this folder (`pl-72 pr-96` fixed sidebar + inspector rail) are desktop-fixed-width only — no `md:`/`lg:` classes exist yet in any `code.html`. This section is the addendum that makes the system responsive. Resolved 2026-08-04: the Associate app reuses this same system (responsive web, not a separate mobile-first design — see `2026-08-03-role-capability-data-visibility-design.md` Resolved decision #4), so these rules apply to every screen in both the Admin and Associate surfaces, not just the setup wizard.

**Breakpoints:** Tailwind defaults (already on the Tailwind CDN in every `code.html`) — `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.

**Three-column wizard/dashboard shell** (fixed left nav `w-72` + fixed right inspector `w-96`):
- Below `lg`: inspector rail collapses into a bottom drawer, opened by a summary button — not deleted, not always-open.
- Below `md`: left nav collapses into a slide-over triggered from the fixed header (`h-16` stays fixed at every breakpoint); main content goes full-width.

**Dense data tables** (Sales Register, Income Ledger, Associate Directory, Audit Log):
- Below `md`: rows become stacked cards, one card per row — key column (name/date/amount) as the card title in `label-mono`, remaining fields as label:value pairs below it.
- Horizontal scroll is a fallback for genuinely wide exports only, never the default row layout.

**Tree Explorer / genealogy view:**
- Below `md`: vertically scrollable with pinch-zoom/pan; node cards shrink to icon + name only. Rank badge and volume figures move behind a tap-to-expand node detail sheet instead of showing inline.

**Multi-column forms** (e.g. `grid-cols-2` field groups):
- Below `sm`: every `grid-cols-2` becomes `grid-cols-1`.

**Sticky footer status bar:**
- Stays fixed, full-width at every breakpoint. Padding steps down from `margin-page` (40px) to `gutter` (24px) below `md`.

**Touch targets:** minimum 44px hit area for any interactive control below `md` (nav items, table row taps, buttons) — the existing `stack-sm`/`base` spacing tokens alone don't guarantee this on dense rows, pad explicitly.

**Design-review requirement:** any new `screen.png`/`code.html`/`DESIGN.md` triple produced from this point forward must include the `md:`/`lg:` responsive classes implementing the rules above — a fixed-width-only reference (like the current setup-wizard screens) doesn't satisfy `code-review`'s Spec axis once this section exists.
