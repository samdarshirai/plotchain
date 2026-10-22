package com.plotchain.expense;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {
    List<Expense> findByExpenseDateBetweenOrderByExpenseDateDescCreatedAtDesc(LocalDate from, LocalDate to);

    // Cycle-management "Trip Expense": expenses whose type is named typeName (case-insensitive) in [from, to].
    @Query("""
        SELECT COALESCE(SUM(e.amount), 0) FROM Expense e, com.plotchain.expensetype.ExpenseType t
        WHERE e.expenseTypeId = t.id AND LOWER(t.name) = LOWER(:typeName)
        AND e.expenseDate BETWEEN :from AND :to
        """)
    BigDecimal sumAmountByTypeNameBetween(
        @Param("typeName") String typeName, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
