package com.plotchain.epin;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EPinEventRepository extends JpaRepository<EPinEvent, UUID> {
    List<EPinEvent> findByEpinIdOrderByAtAscIdAsc(UUID epinId);
}
