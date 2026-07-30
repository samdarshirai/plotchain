package com.plotchain.company;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CompanyBrandingRepository extends JpaRepository<CompanyBranding, UUID> {
}
