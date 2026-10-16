# App design unification

The repository-root `DESIGN.md` governs this pass, including where older screen mockups differ. Company branding settings remain supported.

## Audit and changes

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Booking, income, and project tables used Ink headers in operational content. | Light raised headers, warm borders, Inter headings, and tabular numbers. |
| Medium | Shared operational cards used large rounded corners and decorative shadows. | Shared small-radius controls and panels with warm hairline borders. |
| Medium | Literal brand colors and independent table styles bypassed theme settings. | Palette tokens, shared table defaults, and a shared SCSS stylesheet for reports. |
| Medium | Saved default branding changed Bright Gold; custom button colors could lose contrast. | Exact default highlight and computed readable foregrounds for actions, chrome, and seal labels. |
| Medium | Several seal implementations differed in borders, surfaces, and motion. | Shared animated double frame, light operational seals, explicit Ink dashboard presentation, and reduced-motion handling. |
| Medium | Directory/team tabs and the dashboard sales table overflowed narrow viewports. | Contained table/tab scrolling and a responsive directory header. |
| Low | Editable tables omitted the remove-column header and input accessible names. | Scoped headers and column-based control names. |

The existing page header → filters/actions → table/cards → pagination/detail-panel structure is retained. Specialized table editing, tree navigation, plot views, row actions, and mobile stacked rows keep their existing behavior.

## Screen coverage checklist

- [x] Admin dashboard, record sale, change password.
- [x] Company profile, branding, compensation, payments/KYC, including their shared setup forms.
- [x] Associate directory, tree explorer, KYC queue, sales register, cycle management, ledger register, e-pin register, payout approval.
- [x] Projects/plots and book plot; select a populated project to exercise the plot table where available.
- [x] Bookings/EMI register, unconfirmed payments, confirmed payments, overdue, cancelled, last EMI, transferred.
- [x] Audit log, admin statistics, admin support tickets.
- [x] Associate dashboard, genealogy tree, team directory.
- [x] Plot availability, team/left/right bookings, own bookings, own sales, nested installment tables.
- [x] Welcome letter, profile, bank details, KYC.
- [x] All-income, direct, matching, sponsor-matching, royalty, reward, perk statements.
- [x] Business and EMI reports, payout history, message history, new message.
- [x] E-pin unlock, new/transfer/used registers, join form.
- [x] Login, terms, privacy, all six setup steps.

## Verification

- Production build passed, with configured bundle/style size warnings; 1,485 Angular tests passed.
- All 10 design browser checks and 10 existing mobile regression checks passed. The final reward-grid correction was additionally checked at all four associate viewport widths; public/setup/e-pin screenshot checks were rerun separately.
- Browser test sources also pass a standalone TypeScript check.
- `e2e/design-system.spec.ts`: route checks and screenshots at 360, 390, 768, and 1440px for admin/associate routes; all bookings tabs; public/setup/gated e-pin screens at phone and desktop widths. Checks page overflow, Ink table headers, and primary CTA color.
- Setup uses an intercepted unlaunched setup-state response. Gated e-pin screens use isolated unlock/register responses. Neither fixture changes company configuration or performs an e-pin transaction.
- Existing mobile regression checks cover drawer opening/closing, editable reward inputs, and populated plot-table containment.
- Theme tests cover exact saved default colors, custom foreground contrast, and scoped branding previews. Report tests cover populated and explicit empty states.
- Browser screenshots are generated under the Playwright output directory; keep this generated data out of version control.

Browser coverage exercises the data available in the local instance plus the stated fixtures. Destructive row actions, actual financial transactions, launches, uploads, and every possible backend error are not exercised in the browser sweep; existing unit tests continue to cover their behavior. Source styles for their dialogs and panels use the same shared tokens and controls.

No backend contract, database, route, or business-rule migration is required. `SealCardComponent.surface` adds an optional `parchment | ink` presentation input, defaulting to Parchment.
