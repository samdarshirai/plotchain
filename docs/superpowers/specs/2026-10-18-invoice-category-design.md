# Invoice Category (Admin) — Design

Date: 2026-10-18

## Goal

Add an admin nav category **Invoice** with three items: **Payment Details**, **Add/View Expense**, **Add/View Advance Loan**. Admin-only. Lets admins record company expenses, record advance loans to associates, record repayments against those loans, and view/print a register of repayments.

## Decisions (from brainstorming)

- Payment Details lists **loan repayments only** (not booking/EMI receipts, expenses, or loan disbursements).
- Repayments are **recorded manually** by an admin against a loan, from the Advance Loan list (not from Payment Details, which is read-only + Print).
- **Previous Dues** on Add Advance Loan = read-only outstanding loan balance of the selected associate, auto-filled.
- **Pay To** on expense is free text. **Project** on expense is optional.
- Expense type reuses the existing `expense_type` master (ACTIVE only).
- Records are **append-only**: no edit or delete in v1.

## Out of scope (v1)

Edit/delete, interest or EMI schedules, auto-deduct from associate payouts, CSV/PDF export, associate-facing views, booking/EMI receipts in Payment Details.

## Data model

One Flyway migration. Also extends `settings_audit_log` section CHECK (drop + re-add, as in V57) with `EXPENSE`, `ADVANCE_LOAN`, `LOAN_REPAYMENT`.

- `expense`: id UUID PK, expense_date DATE, expense_type_id FK → `expense_type`, project_id FK nullable, pay_to VARCHAR, amount NUMERIC > 0, pay_mode, bank_name, txn_no, remarks, created_at.
- `advance_loan`: id UUID PK, associate_id FK, loan_date DATE, amount NUMERIC > 0, previous_dues NUMERIC (snapshot at creation, excludes the new loan), pay_mode, bank_name, instrument_no (DD/Cheque/TXN), remarks, created_at.
- `loan_repayment`: id UUID PK, loan_id FK → `advance_loan`, receipt_no VARCHAR unique (from DB sequence, format `RCP-000123`), payment_date DATE, amount NUMERIC > 0, pay_mode, bank_name, txn_no, created_at.
- Outstanding per loan = loan.amount − sum(repayments). Per associate = sum over loans. Computed, never stored.

## Backend

Packages `expense/` and `advanceloan/` (repayments live in `advanceloan/`), mirroring `expensetype/`: controller, service, repository, request/response DTOs, exception. Controllers use `@PreAuthorize("hasAuthority('ADMIN')")`. Every write records an audit entry.

Endpoints under `/api/admin`:

| Method + path | Purpose |
|---|---|
| `POST /expenses`, `GET /expenses` | create; list (filters: date range, type, project) |
| `POST /advance-loans`, `GET /advance-loans` | create; list (filters: associate, date range) with outstanding per loan |
| `GET /advance-loans/dues?associateId=` | outstanding balance, fills Previous Dues |
| `POST /advance-loans/{id}/repayments` | record repayment |
| `GET /loan-repayments` | Payment Details register (filters: date range, associate search by id/name/mobile) |
| `GET /loan-repayments/{id}` | receipt data for Print |

Service rules: amount > 0; repayment ≤ loan's remaining balance (409/422 with clear message); receipt_no from sequence; previous_dues snapshotted before the new loan is saved; expense type must be ACTIVE.

## Frontend

- `admin-nav-categories.model.ts`: new `invoice` category (icon `receipt_long`, placed after Finance) with items `paymentDetails`, `expenses`, `advanceLoans`; routes in `app.routes.ts`; i18n keys in `en.json` and `hi.json`.
- Three standalone components under `admin/invoice/`, each with its own CSS class prefix (avoid style leakage, per support-tickets lesson).
- **Payment Details:** filter bar; table columns S No, Payment Date, Associate Id, Associate Name, Mobile No, Payment Type, Receipt No, Amount, Payment Mode, Bank Name, TXN No, Print. Print opens a print-styled receipt route using `window.print()`; no PDF library.
- **Expenses:** form (Expense Date, Expense Type, Project, Pay To, Amount, Pay Mode, Bank Name, TXN No, Remarks) above list.
- **Advance Loans:** associate picker (Associate Id/Name), read-only Previous Dues, Amount, Pay Mode, Bank Name, DD/Cheque/TXN No, Remarks; list below with a Repay action (date, amount, mode, bank, TXN no).
- Mobile: tables collapse to stacked cards, forms single column; must pass phone-width check.

## Testing

- Backend: service unit tests (validation, over-repayment rejection, receipt numbering, dues math); controller integration test per endpoint group.
- Frontend: update nav-model spec and `app.routes.spec.ts`; component specs for the three screens.
- E2E deferred per standing plan.

## Known limitation

A wrong entry cannot be corrected in the UI (append-only); needs a manual DB fix until edit/void is specced.
