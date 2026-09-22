package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AssociatePhotoRepository extends JpaRepository<AssociatePhoto, UUID> {

    Optional<AssociatePhoto> findByAssociateId(UUID associateId);

    void deleteByAssociateId(UUID associateId);
}
