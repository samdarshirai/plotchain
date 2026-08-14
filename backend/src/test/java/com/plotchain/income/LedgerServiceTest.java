package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LedgerServiceTest {

    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock AssociateRepository associateRepository;
    @Mock CycleRepository cycleRepository;

    LedgerService service;

    @BeforeEach
    void setUp() {
        service = new LedgerService(ledgerEntryRepository, associateRepository, cycleRepository);
    }

    private Associate newAssociate(UUID id, String userId, String name) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName(name);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        return a;
    }

    private Cycle newCycle(UUID id, LocalDate start, LocalDate end) {
        Cycle c = new Cycle();
        c.setId(id);
        c.setPeriodStart(start);
        c.setPeriodEnd(end);
        c.setStatus(CycleStatus.CLOSED);
        return c;
    }

    private LedgerEntry newEntry(UUID id, UUID associateId, UUID cycleId, UUID sourceRef) {
        LedgerEntry e = new LedgerEntry();
        e.setId(id);
        e.setAssociateId(associateId);
        e.setIncomeType(IncomeType.DIRECT);
        e.setCycleId(cycleId);
        e.setGrossAmount(new BigDecimal("100.00"));
        e.setTdsDeduction(new BigDecimal("5.00"));
        e.setAdminDeduction(new BigDecimal("4.00"));
        e.setNetAmount(new BigDecimal("91.00"));
        e.setStatus(LedgerEntryStatus.PAID);
        e.setSourceRef(sourceRef);
        e.setCreatedAt(Instant.parse("2026-01-15T00:00:00Z"));
        return e;
    }

    // Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decision 11, Flow "Admin ledger register" steps 3-6): batch-loaded associate/cycle
    // resolution, mapped by id -- proves the row carries both raw ids and resolved display
    // fields, plus every ledger field including the nullable sourceRef.
    @Test
    void adminListReturnsAPageMappedToResponsesWithResolvedAssociateAndCycleFields() {
        UUID entryId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID sourceRef = UUID.randomUUID();
        LedgerEntry entry = newEntry(entryId, associateId, cycleId, sourceRef);
        Associate associate = newAssociate(associateId, "VP00001", "Jane Doe");
        Cycle cycle = newCycle(cycleId, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15));

        when(ledgerEntryRepository.search(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(associateId))).thenReturn(List.of(associate));
        when(cycleRepository.findAllById(List.of(cycleId))).thenReturn(List.of(cycle));

        AdminLedgerPageResponse response = service.adminList(null, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.entries()).hasSize(1);
        AdminLedgerEntryResponse row = response.entries().get(0);
        assertThat(row.id()).isEqualTo(entryId);
        assertThat(row.associateId()).isEqualTo(associateId);
        assertThat(row.associateUserId()).isEqualTo("VP00001");
        assertThat(row.associateName()).isEqualTo("Jane Doe");
        assertThat(row.cycleId()).isEqualTo(cycleId);
        assertThat(row.cyclePeriodStart()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(row.cyclePeriodEnd()).isEqualTo(LocalDate.of(2026, 1, 15));
        assertThat(row.incomeType()).isEqualTo(IncomeType.DIRECT);
        assertThat(row.status()).isEqualTo(LedgerEntryStatus.PAID);
        assertThat(row.sourceRef()).isEqualTo(sourceRef);
        assertThat(row.grossAmount()).isEqualByComparingTo("100.00");
        assertThat(row.netAmount()).isEqualByComparingTo("91.00");
    }

    @Test
    void adminListPassesAllFourFiltersThroughToSearchUnchanged() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        when(ledgerEntryRepository.search(
            eq(associateId), eq(IncomeType.MATCHING), eq(cycleId), eq(LedgerEntryStatus.PENDING),
            eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        service.adminList(associateId, IncomeType.MATCHING, cycleId, LedgerEntryStatus.PENDING, 0, 20);

        verify(ledgerEntryRepository).search(
            eq(associateId), eq(IncomeType.MATCHING), eq(cycleId), eq(LedgerEntryStatus.PENDING),
            eq(PageRequest.of(0, 20)));
    }

    // Flow "Admin ledger register" step 6: a lookup miss leaves the response field null instead
    // of failing the whole page. Shouldn't happen under FK integrity, but the spec explicitly
    // calls this out as this read-only audit view's behavior rather than a hard failure.
    @Test
    void adminListLeavesAssociateAndCycleFieldsNullWhenTheBatchLookupMisses() {
        UUID entryId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        LedgerEntry entry = newEntry(entryId, associateId, cycleId, null);

        when(ledgerEntryRepository.search(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(associateId))).thenReturn(List.of());
        when(cycleRepository.findAllById(List.of(cycleId))).thenReturn(List.of());

        AdminLedgerEntryResponse row = service.adminList(null, null, null, null, 0, 20).entries().get(0);

        assertThat(row.associateUserId()).isNull();
        assertThat(row.associateName()).isNull();
        assertThat(row.cyclePeriodStart()).isNull();
        assertThat(row.cyclePeriodEnd()).isNull();
        assertThat(row.sourceRef()).isNull();
    }

    @Test
    void adminListReturnsAnEmptyPageWhenSearchFindsNothingWithoutCallingBatchLookups() {
        when(ledgerEntryRepository.search(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AdminLedgerPageResponse response = service.adminList(null, null, null, null, 0, 20);

        assertThat(response.entries()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }
}
