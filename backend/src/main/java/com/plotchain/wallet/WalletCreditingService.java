package com.plotchain.wallet;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleNotFoundException;
import com.plotchain.cycle.CyclePayoutStateException;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

// Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 1, Flow "Wallet crediting"): a separate admin-triggered step from Cycle Management's
// settlement close, deliberately in the wallet package even though it's invoked from a
// cycle-scoped URL (CycleController) -- the logic's job (read LedgerEntry, write Wallet.balance)
// is a wallet-domain concern. Unit 4 (Decision 16) adds a second entry point,
// reconcileCarriedForward, invoked from KycReviewService.decide() rather than an HTTP endpoint --
// the same atomic creditBalance + per-entry status-flip mechanism, reused unmodified.
@Service
public class WalletCreditingService {

    private static final Set<IncomeType> LIVE_INCOME_TYPES = EnumSet.of(
        IncomeType.MATCHING, IncomeType.SPONSOR_MATCHING, IncomeType.ROYALTY, IncomeType.REWARD);

    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final WalletRepository walletRepository;
    private final SettingsAuditService settingsAuditService;

    public WalletCreditingService(
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        WalletRepository walletRepository,
        SettingsAuditService settingsAuditService
    ) {
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.walletRepository = walletRepository;
        this.settingsAuditService = settingsAuditService;
    }

    // Pays a closed cycle's PENDING income into wallets, entry by entry (PENDING -> PAID).
    // Payment belongs to income, not the cycle: the cycle stays CLOSED, so the next cycle's
    // rollup still reads its carry-forward. Row-locks the Cycle first (same discipline as
    // CycleService.close()) so concurrent calls serialize; OPEN/CALCULATING -> 409. Re-running is
    // safe: the entry status flip is the idempotency marker, so a second call finds nothing
    // PENDING and credits zero.
    @Transactional
    public WalletCreditingResult creditWallets(UUID cycleId) {
        Cycle cycle = cycleRepository.findByIdForUpdate(cycleId)
            .orElseThrow(() -> new CycleNotFoundException(cycleId));

        if (cycle.getStatus() != CycleStatus.CLOSED) {
            throw CyclePayoutStateException.settlementNotClosed(cycleId);
        }

        List<LedgerEntry> entries = ledgerEntryRepository.findByCycleIdAndStatus(cycleId, LedgerEntryStatus.PENDING);
        BigDecimal totalCredited = creditEntries(entries);

        return new WalletCreditingResult(cycleId, entries.size(), totalCredited, cycle.getStatus());
    }

    // Wallet/withdrawal unit 4 (Decision 16, Flow "KYC-verification-triggered reconciliation
    // sweep"): invoked from KycReviewService.decide()'s VERIFIED branch only -- no cycleId filter,
    // deliberately unscoped, since withheld income can span any number of past cycles (including
    // ones already paid out for every other associate). Cycle.status is never read or written here --
    // no CycleRepository call at all, matching Decision 16's "never reopen a closed cycle"
    // requirement. associateUserId/actorId are passed straight through by the caller
    // (KycReviewService already has both in scope from its own lookup and its own actorId
    // parameter) rather than adding an AssociateRepository dependency to this package just to
    // resolve a display name for the audit message.
    @Transactional
    public ReconciliationResult reconcileCarriedForward(UUID associateId, String associateUserId, UUID actorId) {
        // Open-cycle Matching/Sponsor Matching/Royalty/Reward rows are live and provisional
        // (CycleService.refreshLiveIncome rewrites them on every payment); they're re-gated on KYC
        // at the next recompute or at close and paid by creditWallets, never swept here.
        List<LedgerEntry> entries = ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD)
            .stream()
            .filter(e -> !LIVE_INCOME_TYPES.contains(e.getIncomeType())
                || cycleRepository.findById(e.getCycleId()).map(c -> c.getStatus() != CycleStatus.OPEN).orElse(true))
            .toList();
        BigDecimal totalCredited = creditEntries(entries);

        // Zero CARRIED_FORWARD entries is the common case -- most associates verify KYC before
        // ever having withheld income. That's a true no-op: no wallet mutation, and (per this
        // guard) no audit entry either, not an empty-detail audit row logged for nothing.
        if (!entries.isEmpty()) {
            settingsAuditService.record("WALLET",
                "Reconciled " + entries.size() + " carried-forward entries for " + associateUserId + " after KYC verification",
                Map.of("entriesCredited", entries.size(), "totalAmount", totalCredited),
                actorId);
        }

        return new ReconciliationResult(associateId, entries.size(), totalCredited);
    }

    // Shared by creditWallets and reconcileCarriedForward: credit each entry's associate,
    // auto-creating a Wallet row on a first-time associate rather than erroring (creditBalance
    // alone would silently affect 0 rows against a non-existent row), flip the entry to PAID, and
    // return the total credited. Callers differ only in how they select `entries` and in what, if
    // anything, they do after this loop (an audit log entry for reconciliation).
    private BigDecimal creditEntries(List<LedgerEntry> entries) {
        BigDecimal totalCredited = BigDecimal.ZERO;
        for (LedgerEntry entry : entries) {
            if (!walletRepository.existsById(entry.getAssociateId())) {
                walletRepository.save(Wallet.zero(entry.getAssociateId()));
            }
            walletRepository.creditBalance(entry.getAssociateId(), entry.getNetAmount());

            entry.setStatus(LedgerEntryStatus.PAID);
            ledgerEntryRepository.save(entry);

            totalCredited = totalCredited.add(entry.getNetAmount());
        }
        return totalCredited;
    }
}
