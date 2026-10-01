package com.plotchain.epin;

import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.eq;
import com.plotchain.associate.AssociateNotActiveException;
import com.plotchain.associate.AssociateStatus;
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

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EPinServiceTest {

    @Mock EPinRepository epinRepository;
    @Mock AssociateRepository associateRepository;
    @Mock EPinEventRepository epinEventRepository;

    static final Instant NOW = Instant.parse("2026-10-01T00:00:00Z");
    final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    // Field-initializer order note (same reasoning as SaleServiceTest's setUp()): a
    // `= new EPinService(epinRepository)` initializer here would run during instance
    // construction, before MockitoExtension's beforeEach() injects the @Mock field, capturing a
    // still-null epinRepository. Constructing epinService in @BeforeEach avoids that.
    EPinService epinService;

    @BeforeEach
    void setUp() {
        epinService = new EPinService(epinRepository, associateRepository, epinEventRepository, clock);
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

        when(epinRepository.search(any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(epin), PageRequest.of(0, 20), 1));

        EPinPageResponse response = epinService.list(EPinStatus.USED, redeemedTo, batchId, null, false, 0, 20);

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
        when(epinRepository.search(any(), any(), any(), any(), anyBoolean(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        epinService.list(EPinStatus.UNUSED, redeemedTo, batchId, null, false, 2, 10);

        verify(epinRepository).search(EPinStatus.UNUSED, redeemedTo, batchId, null, false, NOW, PageRequest.of(2, 10));
    }

    @Test
    void listReturnsAnEmptyPageWhenSearchFindsNothing() {
        when(epinRepository.search(any(), any(), any(), any(), anyBoolean(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        EPinPageResponse response = epinService.list(null, null, null, null, false, 0, 20);

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
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.empty());

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
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(usedEPin));

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
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(unusedEPin));
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
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(unusedEPin));
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
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(unusedEPin));
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

    @Test
    void generateBatchRecordsOneGeneratedEventPerRowAttributedToTheActor() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);
        UUID actor = UUID.randomUUID();

        epinService.generateBatch(new CreateEPinBatchRequest(3), actor);

        verify(epinEventRepository, times(3)).save(events.capture());
        assertThat(events.getAllValues()).allMatch(e ->
            e.getEventType() == EPinEventType.GENERATED && e.getActorId().equals(actor) && e.getAt().equals(NOW));
    }

    @Test
    void redeemRecordsARedeemedEventFromTheCurrentHolderToTheTarget() {
        UUID epinId = UUID.randomUUID();
        UUID holder = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.ALLOCATED);
        pin.setAllocatedTo(holder);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        when(associateRepository.findById(target)).thenReturn(Optional.of(new Associate()));
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        epinService.redeem(epinId, new RedeemEPinRequest(target, RedemptionType.TOPUP, null), actor);

        verify(epinEventRepository).save(events.capture());
        EPinEvent e = events.getValue();
        assertThat(e.getEventType()).isEqualTo(EPinEventType.REDEEMED);
        assertThat(e.getFromAssociateId()).isEqualTo(holder);
        assertThat(e.getToAssociateId()).isEqualTo(target);
        assertThat(pin.getStatus()).isEqualTo(EPinStatus.USED);
        assertThat(pin.getRedeemedAt()).isEqualTo(NOW);
    }

    @Test
    void toResponseMarksAnUnusedPinPastItsExpiryAsExpiredButNeverAUsedOne() {
        EPin expired = new EPin();
        expired.setId(UUID.randomUUID());
        expired.setStatus(EPinStatus.UNUSED);
        expired.setExpiresAt(NOW);
        EPin used = new EPin();
        used.setId(UUID.randomUUID());
        used.setStatus(EPinStatus.USED);
        used.setExpiresAt(NOW.minusSeconds(60));
        when(epinRepository.search(any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(expired, used), PageRequest.of(0, 20), 2));

        EPinPageResponse response = epinService.list(null, null, null, null, false, 0, 20);

        assertThat(response.epins().get(0).expired()).isTrue();
        assertThat(response.epins().get(1).expired()).isFalse();
    }

    @Test
    void generateBatchStampsTheExpiryOnEveryRow() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(i -> i.getArgument(0));
        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        Instant expiry = NOW.plusSeconds(86_400);

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(2, expiry), UUID.randomUUID());

        verify(epinRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).allMatch(e -> expiry.equals(e.getExpiresAt()));
        assertThat(response.expiresAt()).isEqualTo(expiry);
    }

    @Test
    void redeemRejectsAPinWhoseExpiryIsExactlyNow() {
        UUID epinId = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        pin.setExpiresAt(NOW);
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.TOPUP, null), UUID.randomUUID()))
            .isInstanceOf(EPinExpiredException.class);

        verify(epinRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void redeemAcceptsAPinExpiringOneSecondAfterNow() {
        UUID epinId = UUID.randomUUID();
        UUID target = UUID.randomUUID();
        EPin pin = new EPin();
        pin.setId(epinId);
        pin.setStatus(EPinStatus.UNUSED);
        pin.setExpiresAt(NOW.plusSeconds(1));
        when(epinRepository.findByIdForUpdate(epinId)).thenReturn(Optional.of(pin));
        when(associateRepository.findById(target)).thenReturn(Optional.of(new Associate()));

        epinService.redeem(epinId, new RedeemEPinRequest(target, RedemptionType.TOPUP, null), UUID.randomUUID());

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.USED);
    }

    private EPin pinWith(EPinStatus status) {
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setStatus(status);
        when(epinRepository.findByIdForUpdate(pin.getId())).thenReturn(Optional.of(pin));
        return pin;
    }

    @Test
    void blockMovesAnUnusedPinToBlockedRecordingReasonActorAndAnEvent() {
        EPin pin = pinWith(EPinStatus.UNUSED);
        UUID actor = UUID.randomUUID();
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        epinService.block(pin.getId(), "lost voucher", actor);

        assertThat(pin.getStatus()).isEqualTo(EPinStatus.BLOCKED);
        assertThat(pin.getBlockedBy()).isEqualTo(actor);
        assertThat(pin.getBlockedAt()).isEqualTo(NOW);
        assertThat(pin.getBlockReason()).isEqualTo("lost voucher");
        verify(epinEventRepository).save(events.capture());
        assertThat(events.getValue().getEventType()).isEqualTo(EPinEventType.BLOCKED);
        assertThat(events.getValue().getNote()).isEqualTo("lost voucher");
    }

    @Test
    void blockRejectsAUsedOrAlreadyBlockedPinWithNoSideEffects() {
        EPin used = pinWith(EPinStatus.USED);
        EPin blocked = pinWith(EPinStatus.BLOCKED);

        assertThatThrownBy(() -> epinService.block(used.getId(), "x", UUID.randomUUID()))
            .isInstanceOf(EPinInvalidStateException.class);
        assertThatThrownBy(() -> epinService.block(blocked.getId(), "x", UUID.randomUUID()))
            .isInstanceOf(EPinInvalidStateException.class);

        verify(epinRepository, never()).save(any());
        verify(epinEventRepository, never()).save(any());
    }

    @Test
    void unblockRestoresAllocatedWhenAHolderIsSetElseUnusedAndClearsBlockFields() {
        EPin held = pinWith(EPinStatus.BLOCKED);
        held.setAllocatedTo(UUID.randomUUID());
        held.setBlockedBy(UUID.randomUUID());
        held.setBlockReason("r");
        EPin free = pinWith(EPinStatus.BLOCKED);

        epinService.unblock(held.getId(), UUID.randomUUID());
        epinService.unblock(free.getId(), UUID.randomUUID());

        assertThat(held.getStatus()).isEqualTo(EPinStatus.ALLOCATED);
        assertThat(held.getBlockedBy()).isNull();
        assertThat(held.getBlockReason()).isNull();
        assertThat(free.getStatus()).isEqualTo(EPinStatus.UNUSED);
    }

    @Test
    void unblockRejectsAPinThatIsNotBlocked() {
        EPin pin = pinWith(EPinStatus.UNUSED);

        assertThatThrownBy(() -> epinService.unblock(pin.getId(), UUID.randomUUID()))
            .isInstanceOf(EPinInvalidStateException.class);
    }

    @Test
    void redeemRejectsABlockedPinWithNoSideEffects() {
        EPin pin = pinWith(EPinStatus.BLOCKED);

        assertThatThrownBy(() -> epinService.redeem(pin.getId(),
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.TOPUP, null), UUID.randomUUID()))
            .isInstanceOf(EPinBlockedException.class);

        verify(epinRepository, never()).save(any());
    }

    @Test
    void eventsReturnsTheTrailOldestFirstAndThrowsNotFoundForAnUnknownPin() {
        UUID id = UUID.randomUUID();
        when(epinRepository.existsById(id)).thenReturn(true);
        when(epinEventRepository.findByEpinIdOrderByAtAscIdAsc(id)).thenReturn(List.of(
            EPinEvent.of(id, EPinEventType.GENERATED, UUID.randomUUID(), null, null, NOW, null)));

        assertThat(epinService.events(id)).extracting(EPinEventResponse::eventType)
            .containsExactly(EPinEventType.GENERATED);

        UUID missing = UUID.randomUUID();
        when(epinRepository.existsById(missing)).thenReturn(false);
        assertThatThrownBy(() -> epinService.events(missing)).isInstanceOf(EPinNotFoundException.class);
    }

    private Associate associateWith(UUID id, AssociateStatus status) {
        Associate a = new Associate();
        a.setId(id);
        a.setStatus(status);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return a;
    }

    private EPin unusedPin() {
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setCode("c-" + pin.getId());
        pin.setStatus(EPinStatus.UNUSED);
        return pin;
    }

    @Test
    void allocateAssignsTheOldestUnusedPinsToTheAssociateAndRecordsEvents() {
        UUID target = UUID.randomUUID();
        UUID actor = UUID.randomUUID();
        associateWith(target, AssociateStatus.ACTIVE);
        EPin a = unusedPin();
        EPin b = unusedPin();
        when(epinRepository.findAllocatable(eq(NOW), isNull(), eq(PageRequest.of(0, 2)))).thenReturn(List.of(a, b));
        ArgumentCaptor<EPinEvent> events = ArgumentCaptor.forClass(EPinEvent.class);

        AllocateEPinResponse response = epinService.allocate(new AllocateEPinRequest(target, 2, null), actor);

        assertThat(List.of(a, b)).allMatch(p -> p.getStatus() == EPinStatus.ALLOCATED
            && target.equals(p.getAllocatedTo()) && actor.equals(p.getAllocatedBy()) && NOW.equals(p.getAllocatedAt()));
        assertThat(response.count()).isEqualTo(2);
        assertThat(response.pins()).extracting(AllocateEPinResponse.Item::id).containsExactly(a.getId(), b.getId());
        verify(epinEventRepository, times(2)).save(events.capture());
        assertThat(events.getAllValues()).allMatch(e ->
            e.getEventType() == EPinEventType.ALLOCATED && target.equals(e.getToAssociateId()));
    }

    @Test
    void allocateFailsWholesaleWhenThePoolIsSmallerThanCount() {
        UUID target = UUID.randomUUID();
        associateWith(target, AssociateStatus.ACTIVE);
        when(epinRepository.findAllocatable(any(), any(), any())).thenReturn(List.of(unusedPin()));

        assertThatThrownBy(() -> epinService.allocate(new AllocateEPinRequest(target, 3, null), UUID.randomUUID()))
            .isInstanceOf(EPinInsufficientPoolException.class);

        verify(epinRepository, never()).save(any());
        verify(epinEventRepository, never()).save(any());
    }

    @Test
    void allocateRejectsAnUnknownOrNonActiveRecipientBeforeTouchingThePool() {
        UUID unknown = UUID.randomUUID();
        when(associateRepository.findById(unknown)).thenReturn(Optional.empty());
        UUID pending = UUID.randomUUID();
        associateWith(pending, AssociateStatus.PENDING);

        assertThatThrownBy(() -> epinService.allocate(new AllocateEPinRequest(unknown, 1, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotFoundException.class);
        assertThatThrownBy(() -> epinService.allocate(new AllocateEPinRequest(pending, 1, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotActiveException.class);

        verify(epinRepository, never()).findAllocatable(any(), any(), any());
    }
}
