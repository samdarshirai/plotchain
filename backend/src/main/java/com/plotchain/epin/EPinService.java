package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotActiveException;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class EPinService {

    private final EPinRepository epinRepository;
    private final AssociateRepository associateRepository;
    private final EPinEventRepository epinEventRepository;
    private final Clock clock;

    public EPinService(EPinRepository epinRepository, AssociateRepository associateRepository,
                       EPinEventRepository epinEventRepository, Clock clock) {
        this.epinRepository = epinRepository;
        this.associateRepository = associateRepository;
        this.epinEventRepository = epinEventRepository;
        this.clock = clock;
    }

    // epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Generate a batch"): one batchId shared by every row this call creates. Each code is
    // generated via EPinCodeGenerator and defensively retried on an existsByCode collision
    // (Decision 3) before the row is built and saved.
    @Transactional
    public EPinBatchResponse generateBatch(CreateEPinBatchRequest request, UUID actorId) {
        UUID batchId = UUID.randomUUID();
        Instant generatedAt = clock.instant();
        List<String> codes = new ArrayList<>();

        for (int i = 0; i < request.count(); i++) {
            String code;
            do {
                code = EPinCodeGenerator.generate();
            } while (epinRepository.existsByCode(code));

            EPin epin = new EPin();
            epin.setId(UUID.randomUUID());
            epin.setCode(code);
            epin.setBatchId(batchId);
            epin.setStatus(EPinStatus.UNUSED);
            epin.setGeneratedBy(actorId);
            epin.setGeneratedAt(generatedAt);
            epin.setExpiresAt(request.expiresAt());
            epinRepository.save(epin);
            recordEvent(epin.getId(), EPinEventType.GENERATED, actorId, null, null, null);
            codes.add(code);
        }

        return new EPinBatchResponse(batchId, request.count(), codes, generatedAt, request.expiresAt());
    }

    // epin-domain unit 2 (Flows "Admin register"): three independently-optional filters, same
    // null-safe pattern as LedgerService.adminList -- passed straight through to
    // EPinRepository.search unchanged. No batch-resolved associate enrichment (see
    // EPinResponse's own comment for why).
    public EPinPageResponse list(EPinStatus status, UUID redeemedTo, UUID batchId, UUID allocatedTo,
                                 boolean expiredOnly, int page, int size) {
        Page<EPin> result = epinRepository.search(status, redeemedTo, batchId, allocatedTo, expiredOnly,
            clock.instant(), PageRequest.of(page, size));
        List<EPinResponse> epins = result.getContent().stream().map(this::toResponse).toList();
        return new EPinPageResponse(epins, page, size, result.getTotalElements());
    }

    // epin-domain unit 4 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 4-5; Decisions 5, 6, 7, 8): once all three guards (unit 3) pass, this
    // is the only write in the redeem flow -- generation and redemption remain the sole two
    // lifecycle events (Decision 5), so there's no separate "allocate" step to also perform. No
    // write to the Associate row for either RedemptionType (Decision 8) -- activation_fee_paid
    // does not exist on the entity and nothing here adds it. toResponse(...) below is the same
    // helper list(...) already uses.
    @Transactional
    public EPinResponse redeem(UUID id, RedeemEPinRequest request, UUID actorId) {
        EPin epin = epinRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new EPinNotFoundException(id));

        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(id);
        }

        if (epin.getStatus() == EPinStatus.BLOCKED) {
            throw new EPinBlockedException(id);
        }

        if (epin.isExpiredAt(clock.instant())) {
            throw new EPinExpiredException(id);
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        UUID holder = epin.getAllocatedTo();
        epin.setStatus(EPinStatus.USED);
        epin.setRedeemedTo(request.associateId());
        epin.setRedeemedBy(actorId);
        epin.setRedeemedAt(clock.instant());
        epin.setRedemptionType(request.redemptionType());
        epin.setLinkedEntityId(request.linkedEntityId());
        epinRepository.save(epin);
        recordEvent(id, EPinEventType.REDEEMED, actorId, holder, request.associateId(), null);

        return toResponse(epin);
    }

    @Transactional
    public EPinResponse block(UUID id, String reason, UUID actorId) {
        EPin epin = epinRepository.findByIdForUpdate(id).orElseThrow(() -> new EPinNotFoundException(id));
        if (epin.getStatus() == EPinStatus.USED || epin.getStatus() == EPinStatus.BLOCKED) {
            throw new EPinInvalidStateException("Cannot block an e-PIN in status " + epin.getStatus() + ": " + id);
        }
        epin.setStatus(EPinStatus.BLOCKED);
        epin.setBlockedBy(actorId);
        epin.setBlockedAt(clock.instant());
        epin.setBlockReason(reason);
        epinRepository.save(epin);
        recordEvent(id, EPinEventType.BLOCKED, actorId, epin.getAllocatedTo(), null, reason);
        return toResponse(epin);
    }

    @Transactional
    public EPinResponse unblock(UUID id, UUID actorId) {
        EPin epin = epinRepository.findByIdForUpdate(id).orElseThrow(() -> new EPinNotFoundException(id));
        if (epin.getStatus() != EPinStatus.BLOCKED) {
            throw new EPinInvalidStateException("E-PIN is not blocked: " + id);
        }
        epin.setStatus(epin.getAllocatedTo() != null ? EPinStatus.ALLOCATED : EPinStatus.UNUSED);
        epin.setBlockedBy(null);
        epin.setBlockedAt(null);
        epin.setBlockReason(null);
        epinRepository.save(epin);
        recordEvent(id, EPinEventType.UNBLOCKED, actorId, null, epin.getAllocatedTo(), null);
        return toResponse(epin);
    }

    public List<EPinEventResponse> events(UUID id) {
        if (!epinRepository.existsById(id)) {
            throw new EPinNotFoundException(id);
        }
        return epinEventRepository.findByEpinIdOrderByAtAscIdAsc(id).stream().map(EPinEventResponse::from).toList();
    }

    @Transactional
    public AllocateEPinResponse allocate(AllocateEPinRequest request, UUID actorId) {
        Associate recipient = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));
        if (recipient.getStatus() != AssociateStatus.ACTIVE) {
            throw new AssociateNotActiveException(recipient.getId());
        }

        Instant now = clock.instant();
        List<EPin> pool = epinRepository.findAllocatable(now, request.batchId(), PageRequest.of(0, request.count()));
        if (pool.size() < request.count()) {
            throw new EPinInsufficientPoolException(request.count(), pool.size());
        }

        List<AllocateEPinResponse.Item> items = new ArrayList<>();
        for (EPin epin : pool) {
            epin.setStatus(EPinStatus.ALLOCATED);
            epin.setAllocatedTo(recipient.getId());
            epin.setAllocatedBy(actorId);
            epin.setAllocatedAt(now);
            epinRepository.save(epin);
            recordEvent(epin.getId(), EPinEventType.ALLOCATED, actorId, null, recipient.getId(), null);
            items.add(new AllocateEPinResponse.Item(epin.getId(), epin.getCode()));
        }
        return new AllocateEPinResponse(recipient.getId(), items.size(), items);
    }

    private void recordEvent(UUID epinId, EPinEventType type, UUID actorId, UUID from, UUID to, String note) {
        epinEventRepository.save(EPinEvent.of(epinId, type, actorId, from, to, clock.instant(), note));
    }

    private EPinResponse toResponse(EPin epin) {
        boolean live = epin.getStatus() == EPinStatus.UNUSED || epin.getStatus() == EPinStatus.ALLOCATED;
        return new EPinResponse(
            epin.getId(), epin.getCode(), epin.getBatchId(), epin.getStatus(),
            epin.getGeneratedBy(), epin.getGeneratedAt(), epin.getExpiresAt(),
            epin.getAllocatedTo(), epin.getAllocatedBy(), epin.getAllocatedAt(),
            epin.getRedeemedTo(), epin.getRedeemedBy(), epin.getRedeemedAt(),
            epin.getRedemptionType(), epin.getLinkedEntityId(),
            epin.getBlockedBy(), epin.getBlockedAt(), epin.getBlockReason(),
            live && epin.isExpiredAt(clock.instant()));
    }
}
