# Plot & Booking: video (Rudransh reference) vs Plotchain app

## Context
Video = ~3 min phone screen-recording (1 Oct 2026) of a reference MLM land system ("Rudransh Dream Homes", admin panel, mobile). It walks the **Plot Booking** menu and **Master Data > Plot/Flat Details**. Compared against Plotchain (Viraj Acres): admin (`admin`) and associate (`VP00001`) logins on a live instance (Angular on 4201 temp, backend 8081), plus code audit (migrations V10/V14/V20/V41, `BookingService`, routes, nav models).
Deliverable on approval: save this as `docs/design/plot-booking-vs-reference-video.md` (only file written; no code changes).

## What the video shows (reference system)
Admin sidebar: Users, Master Data, Associates, **Plot Booking**, Income, Invoice, Gallery, e-PIN, Support, KYC.
Plot Booking submenu (10 items): Book New Plots · Add Plot EMI · View Booked Plot · Search Booked Plot · View Confirm Plot Payment · View Unconfirm Plot Payment · Plot Transfer · View Plot EMI · View Transferred Plots · View Cancelled Plots. (**Out of scope for Plotchain, per owner: PLC and Plot Transfer / Transferred Plots.** Listed below for reference only.) Also an "Add Plot Booking Payment" screen.

| Screen (video) | What it does |
|---|---|
| Master Data > Plot/Flat Details | Project dropdown (Rudransh City – Saran/Bihar; Anand Vihar Colony – Patna). Table, export icons (copy/Excel/CSV/PDF/print/col-vis) + search: Plot No, Area (800/1200 sqft), Rate/sqft (2299, some 1999), Price |
| Add Plot Booking Payment | Search by Plot No. / Associate ID + project dropdown; error "Invalid Plot No. Or Associate ID" |
| View Plot Booking by Booking Date | From/To date + project; cols S.N., Booking Date, Associate ID/Name, Mobile, Plot No, Area, Rate, ~~PLC~~, Discount, Total Price, Paid, Rest Amount, Details; DataTables export/search/paging |
| Search Booked Plot | Single box: Associate ID / Plot No |
| Confirm Plot Booking Payment Date Wise | date range + project; cols incl. Entry By, **Confirm By, Confirm Date, Print** |
| Unconfirm Plot Booking Payment Date Wise | date range + project; rows with checkboxes; cols Payment Date, Associate ID, Name, Project, Plot No, Amount; **Total row**; **Check All / Uncheck All / "Select One" dropdown / Submit** = bulk confirm |
| Plot Transfer | Search by Plot No / Associate ID |
| View Plot EMI by Last EMI Date | date range + project; cols Booking Date, Assoc ID/Name, Mobile, Plot No, Project, Business, Plot Type, ~~PLC~~, Discount, Total, Paid, Rest, Details |
| View Cancelled Plot by Cancel Date | date range + project; booking/associate/mobile/price/discount/total/paid/rest/details |
Also: Income > Matching Income / Total Income / Rewards; Invoice > Payment Details, Advance Loan, Expense; e-PIN > 6 views (outside this comparison).

## Plotchain today
- **Admin** (Inventory & Bookings, 2 items): *Projects & Plots* (`/settings/projects-plots`: project dropdown; Grid / Site plan / Table views; Add/Edit project, Import CSV, Add plot; table cols Plot(+corner tag), Area, Total, Status Available/Booked/Sold) and *Bookings & EMI* (`/settings/bookings-emi`: Register + Overdue report tabs; filters Status, Associate, Project, Plot, Overdue-only; cols Buyer(+plot/project), Associate, Status, Total, Paid(+bar), Due; side panel with instalment table + Pay / Confirm / Transfer / Cancel). Booking is created from the plot drawer (buyer, phone, token). Separate Finance > Sales Register and `/admin/sales/new` Record Sale (not in menu).
- **Associate** (Plot Bookings): View Plot (read-only), Team Purchase Plots, Left/Right Plot Booking, My Sales; Reports > My Business Datewise, EMI Report.

## Differences
### A. Navigation / information architecture
1. Reference: 10 dedicated Plot Booking screens. Plotchain: 2 admin screens; transfer/cancel/confirm/pay are side-panel actions on a booking, not separate pages.
2. No admin screens for: View Cancelled Plots (only Status=Cancelled filter), Search Booked Plot by text, Confirm/Unconfirm payment lists, View Plot EMI by last EMI date, Add Plot EMI.
3. Plot master lives under Master Data in reference; Plotchain puts it in Inventory & Bookings.

### B. Plot master data
4. Reference Rate/sqft is per-plot and varies (2299 vs 1999); Plotchain stores rate + price separately, but table view shows only Area/Total/Status (no Rate column; grid payload hides rate).
5. Reference lists plot data in a searchable/exportable DataTable; Plotchain table has no search, sort, export/print, or column toggle (CSV is import-only).
6. Plotchain adds things the reference doesn't show: corner plots, Grid + Site plan views, CSV import with validate/commit, project photo, location.

### C. Booking data model & pricing
7. **Discount: absent** in Plotchain (no column, field, or UI). Reference shows it on every booking list. PLC is deliberately NOT to be added (owner decision).
8. No per-booking snapshot of area/rate; booking stores only `total_amount` = plot price at booking time.
9. Reference "Rest Amount" ≈ Plotchain "Due" (OK); "Details" link ≈ side panel (OK).
10. No booking-date input (server clock `booked_at`); reference filters by booking date. No Mobile column in Plotchain register (buyer phone stored, not shown). Register shows Buyer, but not Associate ID as separate column or associate mobile.

### D. Payments & confirmation (largest functional gap)
11. Reference = **two-step**: entry (Entry By) then admin confirm (Confirm By / Confirm Date), with an **Unconfirmed queue + bulk confirm** (Check All/Uncheck All/Submit) and printable receipt. Plotchain = single-step: admin "Pay" marks an instalment PAID immediately; no entry/confirm split, no unconfirmed queue, no bulk, no receipt/print.
12. Plotchain "Confirm" is booking-level (ACTIVE→CONFIRMED, plot→SOLD, creates Sale + income ledger); reference confirms individual payments.
13. Plotchain requires exact instalment amount (no partial/free-form payments); reference has free "Add Plot Booking Payment" by plot/associate search with amount entry. No payment mode/method field (only `paymentRef`).
14. `KYC_GATED` confirm rule is stored but never enforced.

### E. EMI
15. Reference: separate "Add Plot EMI" and "View Plot EMI by Last EMI Date". Plotchain: schedule auto-generated once at booking (token + equal monthly instalments, no interest, count from one global setting); not editable; no add-EMI screen; no last-EMI-date view. Overdue report exists (reference doesn't show one).

### F. Transfer & cancel
16. ~~Plot Transfer~~ — out of scope, ignore (existing associate-reassign transfer stays as is).
17. Cancel requires reason, voids pending instalments, frees plot; no refund accounting; no cancel-date list/report (data exists: `cancelled_at`).

### G. Search, filters, reports
18. Reference: date-range (booking/confirm/cancel/last-EMI date) + project on every list; Plotchain register has no date filters (only sales register has recorded from/to).
19. Reference search by typed Associate ID / Plot No; Plotchain uses associate lookup dropdown + project-scoped plot dropdown.
20. Reference lists have copy/Excel/CSV/PDF/print + search box + DataTables paging; Plotchain has paging only, no export/print on any plot/booking screen.

### H. Associate-side / UI defects seen live
21. Associate "View Plot" empty state shows admin wording ("Add a plot manually, or download the CSV template…").
22. Associate **My Sales**: Associate column shows raw UUID; amounts unformatted (`1500000`, not ₹15,00,000).
23. Associate Left/Right/Team booking pages are unstyled plain tables vs the admin look; no routed "My Bookings"/instalment page (component exists, no route).
24. Associate "View Plot" shows no plots for Boring Road (empty project) and defaults to it; project dropdown lacks a "select" prompt.
25. `/admin/sales/new` (Record Sale) is not in the admin menu; it duplicates the booking path (plotless sales possible).

### I. Not applicable / Plotchain-only
Setup wizard (Booking & EMI policy), cycle/compensation integration on confirm, role/KYC gates, bilingual UI (EN/HI), responsive desktop-first design vs reference mobile web.

## Suggested priorities (if closing gaps)
P1 discount field & column (no PLC); two-step payment entry/confirm with unconfirmed queue + bulk confirm; date-range filters + export on booking lists. P2 Cancelled/EMI-by-last-date views; plot table Rate column + search; Mobile column. P3 fix associate UI defects (#21–23), add Search-by-ID box, receipt print.

## Verification
Video frames reviewed (48 @ 4 s). Live app inspected as admin + VP00001; code audit by Explore agent. Items marked "to confirm" need client clarification (transfer/PLC are now out of scope). To finish: copy this to `docs/design/plot-booking-vs-reference-video.md`; stop temp `ng serve` on 4201.
