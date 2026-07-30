package com.plotchain.company;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface SettingsAuditLogRepository extends JpaRepository<SettingsAuditLog, UUID> {
    Page<SettingsAuditLog> findAllByOrderByChangedAtDesc(Pageable pageable);
    Page<SettingsAuditLog> findAllBySectionOrderByChangedAtDesc(String section, Pageable pageable);
}
