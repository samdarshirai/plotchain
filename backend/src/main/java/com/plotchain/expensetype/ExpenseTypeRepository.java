package com.plotchain.expensetype;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ExpenseTypeRepository extends JpaRepository<ExpenseType, UUID> {
    java.util.Optional<ExpenseType> findByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByNameIgnoreCaseAndIdNot(String name, UUID id);
    List<ExpenseType> findAllByOrderByCreatedAtAsc();
}
