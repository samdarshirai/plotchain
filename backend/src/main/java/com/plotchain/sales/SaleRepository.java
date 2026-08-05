package com.plotchain.sales;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Bare marker interface for this unit -- no custom queries yet. Sales unit 3 (record happy
// path) is the first caller that needs SaleRepository.save(Sale); units 6/7 (admin register,
// associate own-view) will add the filtered/paginated finder methods they need at that point.
public interface SaleRepository extends JpaRepository<Sale, UUID> {
}
