package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssociateKycDocumentRepository extends JpaRepository<AssociateKycDocument, UUID> {

    Optional<AssociateKycDocument> findByAssociateIdAndDocumentType(UUID associateId, String documentType);

    List<AssociateKycDocument> findByAssociateIdOrderByDocumentTypeAsc(UUID associateId);
}
