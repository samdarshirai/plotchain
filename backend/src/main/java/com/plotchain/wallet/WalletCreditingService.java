package com.plotchain.wallet;

import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleNotFoundException;
import com.plotchain.cycle.CyclePayoutStateException;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

// Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 1, Flow "Wallet crediting"): a separate admin-triggered step from Cycle Management's
// settlement close, deliberately in the wallet package even though it's invoked from a
// cycle-scoped URL (CycleController) -- the logic's job (read LedgerEntry, write Wallet.balance)
// is a wallet-domain concern.
@Service
public class WalletCreditingService {

    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final WalletRepository walletRepository;

    public WalletCreditingService(
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        WalletRepository walletRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.walletRepository = walletRepository;
    }

    // Decision 2: row-lock the Cycle FIRST (findByIdForUpdate, the exact method Cycle
    // Management's close() already uses for the same purpose) -- must be this method's first
    // statement, same discipline as CycleService.close(). CLOSED -> proceed; PAID -> already
    // credited (409); OPEN/CALCULATING -> settlement not closed yet (409). A second concurrent
    // call blocks on the row lock, then re-reads status and gets whichever outcome the first
    // call's result implies. No new unique-constraint safety net needed (unlike settlement's
    // idempotency problem): this step only ever UPDATEs existing PENDING rows filtered by status,
    // so a retry after a full rollback finds the exact same uncredited set, and a retry after a
    // real commit finds zero PENDING rows left -- the status transition itself is the idempotency
    // marker.
    @Transactional
    public WalletCreditingResult creditWallets(UUID cycleId) {
        Cycle cycle = cycleRepository.findByIdForUpdate(cycleId)
            .orElseThrow(() -> new CycleNotFoundException(cycleId));

        if (cycle.getStatus() == CycleStatus.PAID) {
            throw CyclePayoutStateException.alreadyCredited(cycleId);
        }
        if (cycle.getStatus() != CycleStatus.CLOSED) {
            throw CyclePayoutStateException.settlementNotClosed(cycleId);
        }

        List<LedgerEntry> entries = ledgerEntryRepository.findByCycleIdAndStatus(cycleId, LedgerEntryStatus.PENDING);

        BigDecimal totalCredited = BigDecimal.ZERO;
        for (LedgerEntry entry : entries) {
            // A first-time associate with no prior Wallet row gets one created rather than
            // erroring -- creditBalance alone would silently affect 0 rows against a
            // non-existent row.
            if (!walletRepository.existsById(entry.getAssociateId())) {
                walletRepository.save(Wallet.zero(entry.getAssociateId()));
            }
            walletRepository.creditBalance(entry.getAssociateId(), entry.getNetAmount());

            entry.setStatus(LedgerEntryStatus.PAID);
            ledgerEntryRepository.save(entry);

            totalCredited = totalCredited.add(entry.getNetAmount());
        }

        // Decision 3: unconditional once the PENDING set above is fully processed, regardless of
        // any CARRIED_FORWARD entries still sitting in this cycle -- PAID means "this cycle's
        // payable-and-KYC-clear income has been released," not "every entry is settled."
        cycle.setStatus(CycleStatus.PAID);
        cycleRepository.save(cycle);

        return new WalletCreditingResult(cycleId, entries.size(), totalCredited, cycle.getStatus());
    }
}
