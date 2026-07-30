package com.plotchain.payments;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface KycConfigRepository extends JpaRepository<KycConfig, UUID> {
}
