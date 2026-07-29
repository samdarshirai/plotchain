package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);
}
