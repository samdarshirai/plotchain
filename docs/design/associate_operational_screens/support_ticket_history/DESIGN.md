---
name: Support Ticket History (Associate Operational Screen)
tokens:
  colors: {same as payout_history/DESIGN.md — surface-page/card/raised, border-subtle, text-primary/muted, brand-primary/secondary/gradient/primary-soft, status-danger}
  typography: {same stack — Geist title, Inter body, JetBrains Mono eyebrow/labels/status/dates}
  radius: {card: 20px, panel: 16px, control: 8px}
  shadow: {card: "0 4px 20px -2px rgba(0,0,0,0.08)"}
---

## Scope

Unit 6 of `docs/superpowers/plans/2026-08-03-support-tickets-units.md`; source `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md`. View-only, paged list of the associate's own tickets from `GET /api/associates/me/support-tickets` (subject, description, status, response, respondedAt, createdAt). No create/respond/edit affordance anywhere: tickets are raised by Admin on the associate's behalf, so the subtitle says "Requests our team has logged for you". Own nav entry (assumed, per units file Open question 3).

## Layout

Same shell as Payout History, minus the balance ribbon (no headline number exists here):

```
ASSOCIATE · SUPPORT TICKETS (eyebrow)
Support Tickets
subtitle
[ filter strip: Status ▾ ]            (surface-raised, 16px, one field)
[ inline-banner danger — load error + Retry, when present ]
┌ .card read-only table ───────────────────────────────────────────┐
│ SUBJECT (+description)  | STATUS | CREATED | ADMIN RESPONSE       │
└──────────────────────────────────────────────────────────────────┘
                                   Page 1 of 1  [Previous] [Next]
```

Subject column leads (bold subject, muted description beneath) because the title is what the associate scans for. Responded date sits under the response text, not in its own column.

## Signature element: the quoted reply

The Admin response renders as a quote with a 3px `--brand-gradient` rail (the same gradient rail the Payout History Balance Ribbon uses), a mono responded-at stamp below. Unanswered tickets show a muted italic "Awaiting a reply" with no rail, so answered vs. waiting reads at a glance without color-coding status. One memorable move; everything else is the sibling-screen baseline.

## Component mapping (no new primitives)

| Need | Component |
|---|---|
| Table + pagination | `EditableTableComponent` (`readOnly`, no actionTemplate); columns Subject, Status, Created, Admin response. Subject/response cells need a small cell template or pre-composed markup (the read-only cell is plain text by default) — see open questions. |
| Status filter | Single `<select>`: All / Open / In progress / Resolved / Closed (closed 4-value enum, spec Decision 3) |
| Error | `InlineBannerComponent` tone="danger" + Retry button (`brand-button--secondary`) |
| Empty | `.editable-table__empty` block, title + one line |

Status stays uniform mono/uppercase/muted, same read-only-cell constraint every sibling screen documents; no colored pills.

## States (all in code.html)

1. Loaded, all four statuses shown.
2. Status filter applied (Resolved), resets to page 1.
3. Empty, no tickets at all: "No support tickets yet" + "When our team logs a request for you, it will appear here with any reply." (no create CTA, by design).
4. Loading: 3 skeleton rows (`--surface-raised` bars, 1.2s opacity pulse, disabled under `prefers-reduced-motion`), filter and pagination disabled.
5. Error: danger banner "Couldn't load your support tickets. Check your connection and try again." + Retry; table not shown.
6. Filter with no matches: "No resolved tickets" + "Try another status, or choose All statuses."

## Responsive (md = 768px, same as siblings)

- Desktop (>768px): max-width 1040px, 4-column table, Subject column ~34%, table min-width 760px with horizontal scroll inside the card as fallback.
- Below 768px: header row hidden; each ticket becomes a stacked card. Subject (Geist 1.0625rem/600) + description lead, full width and unlabeled; Status and Created as `label: value` pairs (data-label technique); Admin response drops to a full-width labeled block with its gradient rail so long replies wrap freely.
- Filter select goes full width; pagination buttons `min-height: 44px`; focus-visible ring on controls.

## Colors / type

Only existing tokens; no new hex or custom property. Danger banner uses `--status-danger`; rail uses `--brand-gradient`; skeleton uses `--surface-raised`. Typography identical to Payout History (Geist/Inter/JetBrains Mono).

## Out of scope

Create/respond/edit/reopen controls, ticket detail page (spec Decision 5), thread/conversation, attachments, notifications, category/priority, assigned-to.

## Open questions

1. Long text: description and response are shown in full in the list (no detail endpoint). Mockup shows them unclamped; if tickets run long, add a 3-line clamp with "Show more" (small addition, not designed).
2. `EditableTableComponent` read-only cells are plain text; needs a cell-template hook (or pre-formatted HTML) for the subject+description and quoted-reply cells. Confirm approach before planning.
3. Nav label: mockup uses "Support Tickets"; units file calls the screen "Support Ticket history". Pick one for the nav and i18n.
4. Responded date is shown only under the response; if you want it as a sortable column, add a 5th column.
