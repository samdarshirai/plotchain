package com.plotchain.associate;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

// Self-scoped by construction: every method takes the caller's own associateId, sourced by
// AssociateNomineeController from @AuthenticationPrincipal -- same pattern as
// AssociateBankDetailsService, which this unit otherwise copies exactly.
@Service
public class AssociateNomineeService {

    private final AssociateRepository associateRepository;
    private final AssociateNomineeRepository associateNomineeRepository;
    private final TransactionPasswordGuard transactionPasswordGuard;

    public AssociateNomineeService(AssociateRepository associateRepository,
                                    AssociateNomineeRepository associateNomineeRepository,
                                    TransactionPasswordGuard transactionPasswordGuard) {
        this.associateRepository = associateRepository;
        this.associateNomineeRepository = associateNomineeRepository;
        this.transactionPasswordGuard = transactionPasswordGuard;
    }

    public AssociateNomineeResponse getNominee(UUID associateId) {
        associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return associateNomineeRepository.findByAssociateId(associateId)
            .map(AssociateNomineeResponse::from)
            .orElseGet(AssociateNomineeResponse::empty);
    }

    public AssociateNomineeResponse updateNominee(UUID associateId, UpdateAssociateNomineeRequest request) {
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        AssociateNominee nominee = associateNomineeRepository.findByAssociateId(associateId)
            .orElseGet(() -> {
                AssociateNominee n = new AssociateNominee();
                n.setId(UUID.randomUUID());
                n.setAssociateId(associateId);
                return n;
            });

        nominee.setNomineeName(request.nomineeName());
        nominee.setRelation(request.relation());
        nominee.setUpdatedAt(Instant.now());
        associateNomineeRepository.save(nominee);

        return AssociateNomineeResponse.from(nominee);
    }
}
