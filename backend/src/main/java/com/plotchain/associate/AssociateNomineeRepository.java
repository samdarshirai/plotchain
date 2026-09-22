package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AssociateNomineeRepository extends JpaRepository<AssociateNominee, UUID> {

    Optional<AssociateNominee> findByAssociateId(UUID associateId);
}
