package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EPinServiceTest {

    @Mock EPinRepository epinRepository;
    @Mock AssociateRepository associateRepository;

    // Field-initializer order note (same reasoning as SaleServiceTest's setUp()): a
    // `= new EPinService(epinRepository)` initializer here would run during instance
    // construction, before MockitoExtension's beforeEach() injects the @Mock field, capturing a
    // still-null epinRepository. Constructing epinService in @BeforeEach avoids that.
    EPinService epinService;

    @BeforeEach
    void setUp() {
        epinService = new EPinService(epinRepository, associateRepository);
    }

    @Test
    void generateBatchProducesTheRequestedCountOfRowsSharingOneBatchIdAllUnused() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        UUID actorId = UUID.randomUUID();

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(3), actorId);

        verify(epinRepository, times(3)).save(captor.capture());
        List<EPin> saved = captor.getAllValues();
        assertThat(saved).hasSize(3);
        assertThat(saved).extracting(EPin::getBatchId).containsOnly(saved.get(0).getBatchId());
        assertThat(saved).allMatch(e -> e.getStatus() == EPinStatus.UNUSED);
        assertThat(saved).allMatch(e -> e.getGeneratedBy().equals(actorId));
        assertThat(saved).allMatch(e -> e.getGeneratedAt() != null);
        assertThat(saved).extracting(EPin::getCode).doesNotHaveDuplicates();

        assertThat(response.batchId()).isEqualTo(saved.get(0).getBatchId());
        assertThat(response.count()).isEqualTo(3);
        assertThat(response.codes()).hasSize(3);
        assertThat(response.generatedAt()).isNotNull();
    }

    @Test
    void generateBatchRetriesOnACodeCollisionAndStillProducesTheRequestedRow() {
        // First existsByCode call simulates a collision (Decision 3); the retry's second call
        // reports no collision, so the loop must still produce exactly one saved row.
        when(epinRepository.existsByCode(any())).thenReturn(true, false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(1), UUID.randomUUID());

        assertThat(response.codes()).hasSize(1);
        verify(epinRepository, times(2)).existsByCode(any());
        verify(epinRepository, times(1)).save(any());
    }

    @Test
    void listReturnsAPageMappedToResponsesWithAllEPinFields() {
        UUID id = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        UUID generatedBy = UUID.randomUUID();
        UUID redeemedTo = UUID.randomUUID();
        UUID redeemedBy = UUID.randomUUID();
        UUID linkedEntityId = UUID.randomUUID();
        Instant generatedAt = Instant.now();
        Instant redeemedAt = Instant.now();

        EPin epin = new EPin();
        epin.setId(id);
        epin.setCode("some-code");
        epin.setBatchId(batchId);
        epin.setStatus(EPinStatus.USED);
        epin.setGeneratedBy(generatedBy);
        epin.setGeneratedAt(generatedAt);
        epin.setRedeemedTo(redeemedTo);
        epin.setRedeemedBy(redeemedBy);
        epin.setRedeemedAt(redeemedAt);
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        epin.setLinkedEntityId(linkedEntityId);

        when(epinRepository.search(any(), any(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(epin), PageRequest.of(0, 20), 1));

        EPinPageResponse response = epinService.list(EPinStatus.USED, redeemedTo, batchId, 0, 20);

        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
        EPinResponse row = response.epins().get(0);
        assertThat(row.id()).isEqualTo(id);
        assertThat(row.code()).isEqualTo("some-code");
        assertThat(row.batchId()).isEqualTo(batchId);
        assertThat(row.status()).isEqualTo(EPinStatus.USED);
        assertThat(row.generatedBy()).isEqualTo(generatedBy);
        assertThat(row.generatedAt()).isEqualTo(generatedAt);
        assertThat(row.redeemedTo()).isEqualTo(redeemedTo);
        assertThat(row.redeemedBy()).isEqualTo(redeemedBy);
        assertThat(row.redeemedAt()).isEqualTo(redeemedAt);
        assertThat(row.redemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(row.linkedEntityId()).isEqualTo(linkedEntityId);
    }

    @Test
    void listPassesAllThreeFiltersAndThePageRequestThroughToSearchUnchanged() {
        UUID redeemedTo = UUID.randomUUID();
        UUID batchId = UUID.randomUUID();
        when(epinRepository.search(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        epinService.list(EPinStatus.UNUSED, redeemedTo, batchId, 2, 10);

        verify(epinRepository).search(EPinStatus.UNUSED, redeemedTo, batchId, PageRequest.of(2, 10));
    }

    @Test
    void listReturnsAnEmptyPageWhenSearchFindsNothing() {
        when(epinRepository.search(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        EPinPageResponse response = epinService.list(null, null, null, 0, 20);

        assertThat(response.epins()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }

    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 1-3): guard-only tests. The happy-path write (step 4-5) is
    // epin-domain unit 4's job -- redeemReachesThePlaceholderWhenAllGuardsPass below only
    // proves the guards let an UNUSED EPin with a resolvable associateId through, not that
    // anything gets written.
    @Test
    void redeemThrowsEPinNotFoundExceptionWhenTheEPinDoesNotExist() {
        UUID epinId = UUID.randomUUID();
        when(epinRepository.findById(epinId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(EPinNotFoundException.class);

        verify(epinRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void redeemThrowsEPinAlreadyRedeemedExceptionWhenTheEPinIsAlreadyUsed() {
        UUID epinId = UUID.randomUUID();
        EPin usedEPin = new EPin();
        usedEPin.setId(epinId);
        usedEPin.setStatus(EPinStatus.USED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(usedEPin));

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(EPinAlreadyRedeemedException.class);

        verify(epinRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void redeemThrowsAssociateNotFoundExceptionWhenTheAssociateIdDoesNotResolve() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(associateId, RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(epinRepository, never()).save(any());
    }

    // epin-domain unit 4 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 4-5; Decisions 5, 6, 7, 8): the happy-path write, once all three
    // guards (unit 3) pass. redeemedTo/redeemedBy/redeemedAt/redemptionType/linkedEntityId are
    // all asserted on both the saved entity and the returned response; the Associate row is
    // never written to, for either RedemptionType (Decision 8).
    @Test
    void redeemSetsStatusUsedAndAllRedemptionFieldsAndSavesForAnActivationRedemption() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(new Associate()));
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinResponse response = epinService.redeem(epinId,
            new RedeemEPinRequest(associateId, RedemptionType.ACTIVATION, null), actorId);

        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        verify(epinRepository).save(captor.capture());
        EPin saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(EPinStatus.USED);
        assertThat(saved.getRedeemedTo()).isEqualTo(associateId);
        assertThat(saved.getRedeemedBy()).isEqualTo(actorId);
        assertThat(saved.getRedeemedAt()).isNotNull();
        assertThat(saved.getRedemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(saved.getLinkedEntityId()).isNull();

        assertThat(response.status()).isEqualTo(EPinStatus.USED);
        assertThat(response.redeemedTo()).isEqualTo(associateId);
        assertThat(response.redeemedBy()).isEqualTo(actorId);
        assertThat(response.redeemedAt()).isNotNull();
        assertThat(response.redemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(response.linkedEntityId()).isNull();

        verify(associateRepository, never()).save(any());
    }

    @Test
    void redeemSetsLinkedEntityIdForATopupRedemptionAndNeverWritesTheAssociateRow() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID linkedEntityId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(new Associate()));
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinResponse response = epinService.redeem(epinId,
            new RedeemEPinRequest(associateId, RedemptionType.TOPUP, linkedEntityId), actorId);

        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        verify(epinRepository).save(captor.capture());
        assertThat(captor.getValue().getRedemptionType()).isEqualTo(RedemptionType.TOPUP);
        assertThat(captor.getValue().getLinkedEntityId()).isEqualTo(linkedEntityId);

        assertThat(response.redemptionType()).isEqualTo(RedemptionType.TOPUP);
        assertThat(response.linkedEntityId()).isEqualTo(linkedEntityId);

        verify(associateRepository, never()).save(any());
    }
}
