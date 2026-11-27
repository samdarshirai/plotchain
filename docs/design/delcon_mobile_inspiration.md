# Delcon Homes member dashboard: mobile inspiration notes

Source: https://www.delconhomes.com/member/dashboard.php, viewed at 390px (iframe, same-origin, logged-in member).
Date: 2026-11-27

## What Delcon does on mobile (mostly cautionary)

- Same desktop page squeezed. Layout broken at 390px: header text ("Territory Manager", member name, avatar) overlaps logo; horizontal nav collapses to red empty bar plus stray vertical lines; no hamburger.
- Page overflows sideways (scrollWidth 414 > clientWidth 390). Tiles clipped at right edge, description text cut off.
- Dashboard = 17 big tile cards, 1 per row, ~140px tall each (icon circle left, title + one-line description right). Total page ~5176px tall. Long scroll to reach anything.
- Tiles are nav shortcuts only (Edit Profile, Bank, Upload Doc, Change Pwd, Tree, Down Line, Direct Members, Pins, Payout Summary, Messages, Plot Booking, Seminars, Signout). Zero live numbers except "New Left/Right Business".
- Red banner "KYC Pending" above tiles: good idea (blocking status first), poor execution (just a heading).
- Rank ladder at bottom (Sales Executive ... Sales Director) as list.
- Desktop: top bar with 9 menus, dropdown submenus (e-PIN, Profile, Genealogy, Plot Booking, Inventory, Income, Support).

## Worth borrowing (idea, not look)

1. Status banner at top for blocking items (KYC pending) with tap-through to fix.
2. Icon + title shortcut tiles for common actions, but 2 per row, no description line.
3. Designation/rank progress visible on dashboard (we have designation-replaces-rank).
4. Left/right business numbers on first screen (our left/right tiles already done, commit b882c0aa).
5. Session identity block: avatar, name, designation.

## Avoid

- Desktop nav squeezed into phone width. Use drawer (hamburger) or bottom tab bar.
- Sideways page scroll, clipped cards.
- One tile per row with paragraph text.
- Broken avatar image with no fallback: use initials circle.
- Red/pink-green gradient tiles: dated, low contrast (red text on pink).

## Proposed plotchain mobile shape (draft, needs answers below)

- Top app bar: menu button, logo/title, avatar (initials fallback).
- Bottom tab bar (4-5): Home, Network, Bookings, Income, More.
- Home: status banner (KYC/pending) -> KPI cards 2x2 (wallet, this-month income, left/right business) -> quick actions icon grid 4 per row -> recent sales list as cards -> designation progress.
- "More" sheet holds profile, bank, docs, passwords, support, logout.
- Tables follow CLAUDE.md rule (scroll inside table on phones, page never scrolls sideways).

## Questions for user

1. Scope: associate app only, or admin too?
2. Navigation: bottom tab bar vs. hamburger drawer? (Current sidebars: pin-by-logo.)
3. Dashboard: tiles as shortcuts (Delcon style) or live KPI cards first?
4. Is "mobile app" = responsive web (PWA-ish) or native shell later?
5. Which 4-5 actions do associates use most on phone?
6. Keep brand colors or restyle (see sidebar_color_options undecided)?
