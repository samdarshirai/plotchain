package com.plotchain.projects;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlotRepository extends JpaRepository<Plot, UUID> {

    boolean existsByProjectId(UUID projectId);

    Page<Plot> findAllByProjectId(UUID projectId, Pageable pageable);

    Optional<Plot> findByIdAndProjectId(UUID id, UUID projectId);

    List<Plot> findAllByProjectIdAndPlotNoIn(UUID projectId, Collection<String> plotNos);

    long countByProjectId(UUID projectId);

    long countByProjectIdAndStatus(UUID projectId, PlotStatus status);
}
