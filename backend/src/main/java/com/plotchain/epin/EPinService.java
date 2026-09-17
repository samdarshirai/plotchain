package com.plotchain.epin;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class EPinService {

    private final EPinRepository epinRepository;

    public EPinService(EPinRepository epinRepository) {
        this.epinRepository = epinRepository;
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
}
