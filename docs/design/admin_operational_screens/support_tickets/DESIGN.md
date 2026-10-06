---
name: Support Ticket Queue (Admin Operational Screen)
tokens:
  colors: { reuse: "same var() tokens as bookings_emi/sales_register: --surface-page/card/raised, --border-subtle, --text-primary/muted, --brand-primary/secondary/primary-soft, --status-success/warning/danger (+ -ink variants)" }
  typography: { reuse: "Geist (title, seal heading), Inter (body), JetBrains Mono (eyebrow, field/column labels, ids, dates)" }
  radius: { card: 20px, filters: 16px, control: 8px, pill: 999px }
---

Unit 5 of `docs/superpowers/plans/2026-08-03-support-tickets-units.md`; spec `specs/role-capability/2026-08-03-support-tickets-domain-design.md`. No new palette, no new shared primitive: chrome, tokens, filters strip, ledger table, double-ruled "seal" side panel, pager and banners are the Bookings & EMI idioms re-scoped under `.tickets__*`. Files: `code.html` (state switcher bottom-left, hide with `#clean`; hash `#list=ok|loading|empty|filtered|error&seal=respond|respond-invalid|log|log-invalid|none&flash=ok`), `screen.png`, plus `screen-blank-reply`, `screen-log-form`, `screen-empty`, `screen-error`, `screen-loading`, `screen-mobile` PNGs.

## Layout (desktop, content max 1280)

```
Eyebrow "System"                                         
Support Tickets                                    [+ Log a ticket]
Log what an associate reported by phone or message, then reply and move it to resolved.
[ Status ▾ ] [ Associate lookup ] [Reset filters]            <- surface-raised strip
[ success banner after log/respond ]
┌ queue card ───────────────────────┐  ┌ seal 420px, sticky ─┐
│ Ticket | Associate | Status|Logged │  │ Ticket / Log a ticket│
│ subject + 1-line snippet   ...     │  │ (one at a time)      │
└───────────────────────────────────┘  └─────────────────────┘
        Previous  Page 1 of 3 · 47 tickets  Next
```

Memorable element: the queue rows carry the ticket's own words (bold subject, muted one-line snippet) so an admin can triage without opening, since there is no detail endpoint (spec Decision 5; each row already holds full content).

## Queue

- Columns: Ticket (subject + truncated description), Associate (name + mono userId e.g. VA-0042), Status chip, Logged (mono date). Server order: `createdAt` desc. Row is `tr tabindex=0`, Enter/Space selects; selected = soft violet fill + violet left rule.
- Status chips (dot + sentence-case label, never all caps): Open = warning tint, In progress = brand-primary-soft, Resolved = success tint, Closed = muted raised. Backend values `OPEN | IN_PROGRESS | RESOLVED | CLOSED`.
- Filters: Status select ("All statuses" + 4 values; no default filter, spec Flows) and Associate via the existing `app-associate-lookup` (same component as Bookings filter/transfer) -> `associateId`. Either/both/neither; changing one reloads page 0. "Reset filters" is a text button.
- Pager: reuse `.pager`, "Page {n} of {total} · {count} tickets"; `GET /api/admin/support-tickets?status&associateId&page&size` (default 20, max 100).

## Seal panel (one mode at a time)

**Respond** (default once a row is selected). Header: subject, "Name · userId". Meta: Status chip, Logged date, Description (full, wraps, `pre-wrap`). If a response exists: "Current reply" quote block with "Replied {date}" (`respondedAt`); otherwise "No reply yet." Form: Status select (4 values, preset to ticket's current status), Reply textarea (4 rows), primary "Save response". Hint: "Required for Resolved and Closed. The associate sees this reply. Saving a new reply replaces the current one." (single response, Decision 2). A red `*` on the Reply label appears only while Resolved/Closed is selected. Blank reply with Resolved/Closed: textarea gets danger border + `aria-invalid`, `field-error` "Add a reply before resolving or closing this ticket." shown on submit (client check mirrors the 400 from Decision 4; a server 400 shows the same message). Open/In progress with blank reply is valid and leaves the existing reply untouched (status-only change). No transition restrictions; reopening a Closed ticket is allowed. Pending verb: "Saving…". Success banner: "Response saved. Ticket {subject} is now {status}." Row patched in place from the returned `SupportTicketResponse`; selection kept, and if the new status no longer matches the status filter the row stays selected with the note "This ticket no longer matches the current filters" (same pattern as Bookings Q9).

**Log a ticket** (button top-right; Cancel returns to respond/none). Fields: Associate (`app-associate-lookup`, required; shows "VA-0042 Anjali Rao" once chosen), Subject (single line, required), Description (textarea, required). No status field: always starts Open. Submit "Log ticket", pending "Logging…". Client validation: all three required -> "Choose an associate and fill in the subject and description." Server: 404 unknown associate -> under the lookup "That associate wasn't found."; 400 -> generic field message. Success: banner "Ticket logged. "{subject}" is open for {name} ({userId})." then reload page 0, select the new ticket.

## States

- Loading: three skeleton rows in the same table (`aria-busy`), seal shows "Select a ticket…" placeholder; filters stay usable.
- Empty (no tickets at all): glyph, "No tickets yet", "When an associate reports a problem, log it here so it can be tracked to a reply." + primary "Log a ticket".
- Empty with filters: "No tickets match these filters" + "Reset filters" (secondary).
- Load error: danger banner "The ticket queue didn't load. Check your connection and try again. Nothing was changed." + Retry. Action errors (save/log failures) use the same banner above the list with the message from the server; respond 404 -> "This ticket no longer exists. Reload the queue."
- Nothing selected: seal reads "Select a ticket to read it and reply."

## Responsive and a11y

Breakpoints identical to Bookings & EMI: <=1100 seal narrows to 360px; <=960 sidebar becomes the topbar, grid is one column, seal is static below the list (selecting a row should scroll it into view and move focus to its heading); <=768 table becomes stacked cards (subject + snippet as title, `label: value` pairs via `data-label`), filters stack full width, Reset full width, pager spreads, form actions stack. Touch targets 44px. Seal is `aria-live=polite`; visible focus ring; labels tied to inputs; errors use `role=alert` and are not colour-only; reduced motion respected (skeleton and spinner stop).

## Copy

Sentence case throughout; actions keep one name: "Log a ticket" -> "Log ticket" -> toast "Ticket logged"; "Save response" -> "Saving…" -> "Response saved". Dates via locale pipes (en-IN), never concatenated.

## Open design questions

1. Folder name: units file says `support_ticket_queue/`, request said `support_tickets/`; this one is `support_tickets/`. Update the units file or rename.
2. Nav home: designed as a System sub-item next to KYC Review; confirm vs. a top-level "Support" entry.
3. Reply is replace-only (no history); do we want a visible "replaces the current reply" confirmation when a reply already exists? Currently hint text only.
4. Associate-column filter by name only shows the picker, not a "recently logged for" shortcut; drill-down from the Associate Directory is out of slice (units Open question 2).
5. Mock uses the repo's violet/cyan Stitch palette as in sibling designs, not the gold/oxblood live `_tokens.scss` (existing sibling-dir note says implementers port deliberately).
