package com.plotchain.epin;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EPinEventRepository extends JpaRepository<EPinEvent, UUID> {
    Optional<EPinEvent> findFirstByEpinIdAndEventTypeInAndToAssociateIdOrderByAtDesc(
        UUID epinId, Collection<EPinEventType> types, UUID toAssociateId);

    List<EPinEvent> findByEpinIdOrderByAtAscIdAsc(UUID epinId);
}
