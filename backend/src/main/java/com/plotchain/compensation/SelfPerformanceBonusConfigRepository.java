package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SelfPerformanceBonusConfigRepository extends JpaRepository<SelfPerformanceBonusConfig, UUID> {
}
