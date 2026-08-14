package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 2): one service backs both the admin register and (a follow-up unit's) associate-self
// endpoint -- there's no write path here to justify splitting into separate classes, same
// reasoning the Sales spec gave for keeping SaleService as one class behind two controllers.
@Service
public class LedgerService {

    private final LedgerEntryRepository ledgerEntryRepository;
    private final AssociateRepository associateRepository;
    private final CycleRepository cycleRepository;

    public LedgerService(
            LedgerEntryRepository ledgerEntryRepository,
            AssociateRepository associateRepository,
            CycleRepository cycleRepository) {
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.associateRepository = associateRepository;
        this.cycleRepository = cycleRepository;
    }

    // Flow "Admin ledger register" (same spec doc, steps 1-7): full cross-associate visibility.
    // Batch-resolves associate identity and cycle dates once per page, mapped by id -- the same
    // pattern AdminAssociateService.ranksById() already establishes -- rather than querying once
    // per row.
    public AdminLedgerPageResponse adminList(
            UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size) {
        Page<LedgerEntry> result = ledgerEntryRepository.search(
            associateId, incomeType, cycleId, status, PageRequest.of(page, size));

        List<LedgerEntry> content = result.getContent();
        Map<UUID, Associate> associatesById = associatesById(content);
        Map<UUID, Cycle> cyclesById = cyclesById(content);

        List<AdminLedgerEntryResponse> entries = content.stream()
            .map(e -> toAdminResponse(e, associatesById.get(e.getAssociateId()), cyclesById.get(e.getCycleId())))
            .toList();
        return new AdminLedgerPageResponse(entries, page, size, result.getTotalElements());
    }

    // Shared with (a follow-up unit's) GET /api/associates/me/ledger: every ledger row needs its
    // cycle's period dates resolved the same way regardless of who's asking.
    private Map<UUID, Cycle> cyclesById(List<LedgerEntry> entries) {
        List<UUID> distinctCycleIds = entries.stream().map(LedgerEntry::getCycleId).distinct().toList();
        return cycleRepository.findAllById(distinctCycleIds).stream()
            .collect(Collectors.toMap(Cycle::getId, c -> c));
    }

    private Map<UUID, Associate> associatesById(List<LedgerEntry> entries) {
        List<UUID> distinctAssociateIds = entries.stream().map(LedgerEntry::getAssociateId).distinct().toList();
        return associateRepository.findAllById(distinctAssociateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
    }

    // A missing associate or cycle lookup (should not happen under FK integrity) leaves the
    // corresponding fields null rather than failing the whole page -- this is a read-only audit
    // view, not a strict-consistency write path (Flow step 6).
    private AdminLedgerEntryResponse toAdminResponse(LedgerEntry entry, Associate associate, Cycle cycle) {
        return new AdminLedgerEntryResponse(
            entry.getId(),
            entry.getAssociateId(),
            associate == null ? null : associate.getUserId(),
            associate == null ? null : associate.getName(),
            entry.getIncomeType(),
            entry.getCycleId(),
            cycle == null ? null : cycle.getPeriodStart(),
            cycle == null ? null : cycle.getPeriodEnd(),
            entry.getGrossAmount(),
            entry.getTdsDeduction(),
            entry.getAdminDeduction(),
            entry.getNetAmount(),
            entry.getStatus(),
            entry.getSourceRef(),
            entry.getCreatedAt());
    }
}
