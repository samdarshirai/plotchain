package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AssociateBankDetailsRepository extends JpaRepository<AssociateBankDetails, UUID> {

    Optional<AssociateBankDetails> findByAssociateId(UUID associateId);
}
