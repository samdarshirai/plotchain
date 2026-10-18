package com.plotchain.advanceloan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface LoanRepaymentRepository extends JpaRepository<LoanRepayment, UUID> {

    @Query("select coalesce(sum(r.amount), 0) from LoanRepayment r where r.loanId = :loanId")
    BigDecimal sumAmountByLoan(@Param("loanId") UUID loanId);

    @Query("select coalesce(sum(r.amount), 0) from LoanRepayment r, AdvanceLoan l where r.loanId = l.id and l.associateId = :associateId")
    BigDecimal sumAmountByAssociate(@Param("associateId") UUID associateId);

    @Query("select r.loanId, sum(r.amount) from LoanRepayment r where r.loanId in :loanIds group by r.loanId")
    List<Object[]> sumsByLoanIds(@Param("loanIds") Collection<UUID> loanIds);

    List<LoanRepayment> findByLoanIdOrderByPaymentDateDescCreatedAtDesc(UUID loanId);

    @Query(value = "select nextval('loan_repayment_receipt_seq')", nativeQuery = true)
    long nextReceiptNumber();

    @Query("""
        select r from LoanRepayment r, AdvanceLoan l, Associate a
        where r.loanId = l.id and l.associateId = a.id
          and r.paymentDate between :from and :to
          and (lower(a.userId) like :q escape '\\' or lower(a.name) like :q escape '\\' or a.phone like :q escape '\\')
        order by r.paymentDate desc, r.createdAt desc
        """)
    List<LoanRepayment> search(@Param("from") LocalDate from, @Param("to") LocalDate to, @Param("q") String q);
}
