package com.plotchain.epin;

import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class EPinService {

    private final EPinRepository epinRepository;
    private final AssociateRepository associateRepository;

    public EPinService(EPinRepository epinRepository, AssociateRepository associateRepository) {
        this.epinRepository = epinRepository;
        this.associateRepository = associateRepository;
    }

    // epin-domain unit 1 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Generate a batch"): one batchId shared by every row this call creates. Each code is
    // generated via EPinCodeGenerator and defensively retried on an existsByCode collision
    // (Decision 3) before the row is built and saved.
    @Transactional
    public EPinBatchResponse generateBatch(CreateEPinBatchRequest request, UUID actorId) {
        UUID batchId = UUID.randomUUID();
        Instant generatedAt = Instant.now();
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
            epinRepository.save(epin);
            codes.add(code);
        }

        return new EPinBatchResponse(batchId, request.count(), codes, generatedAt);
    }

    // epin-domain unit 2 (Flows "Admin register"): three independently-optional filters, same
    // null-safe pattern as LedgerService.adminList -- passed straight through to
    // EPinRepository.search unchanged. No batch-resolved associate enrichment (see
    // EPinResponse's own comment for why).
    public EPinPageResponse list(EPinStatus status, UUID redeemedTo, UUID batchId, int page, int size) {
        Page<EPin> result = epinRepository.search(status, redeemedTo, batchId, PageRequest.of(page, size));
        List<EPinResponse> epins = result.getContent().stream().map(this::toResponse).toList();
        return new EPinPageResponse(epins, page, size, result.getTotalElements());
    }

    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 1-3): guards only. epin-domain unit 4 inserts the happy-path
    // status/redeemedTo/redeemedBy/redeemedAt/redemptionType/linkedEntityId writes and
    // epinRepository.save between the associate-lookup guard below and the placeholder throw --
    // sequentially, without changing this method's signature -- following the same guard-only
    // convention SaleService.voidSale's Sales unit 4 established
    // (docs/superpowers/plans/2026-08-10-sales-void-guards.md).
    public EPinResponse redeem(UUID id, RedeemEPinRequest request, UUID actorId) {
        EPin epin = epinRepository.findById(id)
            .orElseThrow(() -> new EPinNotFoundException(id));

        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(id);
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Placeholder: epin-domain unit 4 replaces this line with the status/redeemedTo/
        // redeemedBy/redeemedAt/redemptionType/linkedEntityId writes and epinRepository.save
        // (spec flow steps 4-5).
        throw new UnsupportedOperationException(
            "e-PIN redeem happy path is not yet implemented (epin-domain unit 4)");
    }

    private EPinResponse toResponse(EPin epin) {
        return new EPinResponse(
            epin.getId(), epin.getCode(), epin.getBatchId(), epin.getStatus(),
            epin.getGeneratedBy(), epin.getGeneratedAt(),
            epin.getRedeemedTo(), epin.getRedeemedBy(), epin.getRedeemedAt(),
            epin.getRedemptionType(), epin.getLinkedEntityId());
    }
}
