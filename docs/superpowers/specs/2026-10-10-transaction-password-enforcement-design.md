# Transaction Password Enforcement

Date: 2026-10-10

## Goal

Every associate has two independent secrets: the login password and a transaction password. Money-moving and sensitive self-service actions require the transaction password. Today it exists but is optional and gates only two screens; this spec makes it mandatory, brute-force-protected, and admin-recoverable.

## Current state (verified in code)

- `associate.transaction_password_hash` (V39), nullable. Null means "not set".
- `POST /api/associates/me/transaction-password` sets/changes it (`TransactionPasswordService`); min length 6; change requires the current one.
- `TransactionPasswordVerifier.requireIfSet` gates profile save (`AssociateProfileService`) and nominee save (`AssociateNomineeService`) and is a **no-op when no password is set**.
- Associate-initiated writes today: E-PIN redeem and transfer (`AssociateEPinController`), profile PUT, nominee PUT. Withdrawals are admin-submitted (`POST /api/admin/withdrawals`); associates only read their own history.
- No lockout exists on login or transaction password. Admin login-password reset exists (`AdminAssociateService.resetPassword`).

## Decisions

| Question | Decision |
|---|---|
| Which actions are gated | Associate-initiated actions only: E-PIN redeem, E-PIN transfer, profile save, nominee save. Admin screens stay login-password only. |
| Password not yet set | Gated action is rejected until one is set. No forced prompt at login. |
| Brute force | 5 consecutive wrong attempts lock the transaction password for 30 minutes. |
| Forgotten password | Admin reset only. No email/OTP, no self-service reset. |
| How password is supplied | Per request, in the body (stateless). No verify-token. |

## Design

### 1. Data (V44 migration)

On `associate`:
- `transaction_password_failed_attempts INT NOT NULL DEFAULT 0`
- `transaction_password_locked_until TIMESTAMP NULL`

Mirror both fields on the `Associate` entity.

### 2. Guard

Replace `TransactionPasswordVerifier.requireIfSet` with `TransactionPasswordGuard.require(UUID associateId, String supplied)`. Order of checks:

1. Hash null: throw `TransactionPasswordNotSetException` (HTTP 409, error code `TRANSACTION_PASSWORD_NOT_SET`).
2. `locked_until` in the future: throw `TransactionPasswordLockedException` (HTTP 423, code `TRANSACTION_PASSWORD_LOCKED`, body carries `lockedUntil`).
3. Supplied blank or does not match: increment `failed_attempts`; on reaching 5 set `locked_until = now + 30 min` and reset the counter; throw `InvalidTransactionPasswordException` (existing, HTTP as today).
4. Match: reset `failed_attempts` to 0 and clear `locked_until`.

A `locked_until` in the past is treated as unlocked (no cleanup job needed).

The failure-counter write must survive the request failing: run it in its own `REQUIRES_NEW` transaction, otherwise the caller's rollback erases the increment and lockout never triggers. Concurrent wrong attempts must not under-count: update the counter with a row lock (`SELECT ... FOR UPDATE` via the repository) inside that transaction.

### 3. Gated endpoints

- `POST /api/associates/me/epins/{id}/redeem` and `/transfer`: add `@NotBlank transactionPassword` to `AssociateRedeemEPinRequest` and `TransferEPinRequest`. Call the guard before any state change.
- Profile PUT and nominee PUT: call the guard; remove the skip-if-unset behavior. Request field stays `transactionPassword`, now effectively required (rejected as NOT_SET if the associate has none).
- `POST /api/associates/me/transaction-password` (set/change):
  - First-time set (hash null): no current password needed.
  - Change: current password verified through the same lock/attempt logic as the guard.
  - New password must differ from the login password (`passwordEncoder.matches(new, passwordHash)` rejects). Min length 6 unchanged.

### 4. Admin recovery

`POST /api/admin/associates/{id}/reset-transaction-password`, same authorization as the existing admin reset-password route. Sets hash to null, `failed_attempts` to 0, `locked_until` to null, writes a `SettingsAuditService` ASSOCIATE-section entry ("Reset transaction password for <userId>"). Returns 204. The associate must set a new one before any gated action.

### 5. Frontend

- `auth.interceptor.ts` already treats transaction-password errors as non-session-fatal; extend the handling for `TRANSACTION_PASSWORD_NOT_SET` (navigate to the my-account set-password section) and `TRANSACTION_PASSWORD_LOCKED` (show the unlock time).
- E-PIN redeem and transfer dialogs gain a transaction-password input; send it in the request.
- Admin associate screen gains a "Reset transaction password" action with confirmation.
- Add `en.json` and `hi.json` strings for the new errors and labels.

### 6. Testing

Backend:
- Guard unit tests: unset, locked, wrong password, 5th failure sets lock, success resets counter, expired lock treated as unlocked.
- Integration test: failed attempt persists although the request transaction rolls back; concurrent wrong attempts count correctly.
- Each gated endpoint (E-PIN redeem, transfer, profile, nominee) rejects missing/wrong/unset/locked cases and leaves state unchanged.
- Set/change: first-time set, change with wrong current counts toward lock, new equal to login password rejected.
- Admin reset: clears hash/counter/lock, audit entry written, non-admin forbidden.

Frontend:
- Interceptor specs for NOT_SET and LOCKED.
- E-PIN dialog specs send the password; error display.
- Admin reset action spec.

## Out of scope

- Gating admin actions (withdrawal decision/disburse, wallet credit, booking and sale operations).
- Associate self-service withdrawal request (does not exist today). When built, it calls `TransactionPasswordGuard.require` like the E-PIN endpoints.
- Email/OTP or self-service recovery.
- Login lockout.
- Strength rules beyond existing min length and the differs-from-login rule.

## Rollout note

Existing associates have no transaction password. After deploy they get `TRANSACTION_PASSWORD_NOT_SET` on gated actions until they set one in my-account. Profile/nominee save now also requires it, which is a deliberate behavior change from bootstrapping-skip.
