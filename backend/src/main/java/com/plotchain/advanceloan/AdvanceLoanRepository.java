package com.plotchain.advanceloan;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdvanceLoanRepository extends JpaRepository<AdvanceLoan, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from AdvanceLoan l where l.id = :id")
    Optional<AdvanceLoan> findByIdForUpdate(@Param("id") UUID id);

    @Query("select coalesce(sum(l.amount), 0) from AdvanceLoan l where l.associateId = :associateId")
    BigDecimal sumAmountByAssociate(@Param("associateId") UUID associateId);

    @Query("select l from AdvanceLoan l where l.loanDate between :from and :to order by l.loanDate desc, l.createdAt desc")
    List<AdvanceLoan> findInRange(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
