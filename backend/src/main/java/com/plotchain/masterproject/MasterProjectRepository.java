package com.plotchain.masterproject;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MasterProjectRepository extends JpaRepository<MasterProject, UUID> {
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, UUID id);
    List<MasterProject> findAllByOrderByNameAsc();
}
