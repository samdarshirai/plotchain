package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

// Admin payments list (U3): unconfirmed queue (ENTERED) or confirmed ledger (PAID), date filter on paid_at.
@Service
public class PaymentLedgerService {

    private final EmiInstallmentRepository emiInstallmentRepository;

    public PaymentLedgerService(EmiInstallmentRepository emiInstallmentRepository) {
        this.emiInstallmentRepository = emiInstallmentRepository;
    }

    private static final List<UUID> NO_SCOPE = List.of(new UUID(0, 0)); // unused when scoped=false

    // page/size must already be clamped by the caller (controller).
    @Transactional(readOnly = true)
    public PaymentPageResponse list(InstallmentStatus status, LocalDate from, LocalDate to, UUID projectId,
                                    UUID associateId, String plotNo, int page, int size) {
        return query(status, from, to, projectId, associateId != null,
            associateId == null ? NO_SCOPE : List.of(associateId), plotNo, page, size);
    }

    // Confirmed payments of bookings owned by any of ids (associate self+downline report); ids must be non-empty.
    @Transactional(readOnly = true)
    public PaymentPageResponse listConfirmedFor(Collection<UUID> ids, LocalDate from, LocalDate to, String plotNo,
                                                int page, int size) {
        return query(InstallmentStatus.PAID, from, to, null, true, ids, plotNo, page, size);
    }

    private PaymentPageResponse query(InstallmentStatus status, LocalDate from, LocalDate to, UUID projectId,
                                      boolean scoped, Collection<UUID> ids, String plotNo, int page, int size) {
        var fromInstant = BookingService.fromInstant(from);
        var toInstant = BookingService.toInstant(to);
        // No date bounds: skip the paid_at predicate so legacy PAID rows with NULL paid_at still list.
        boolean unbounded = from == null && to == null;
        String plot = plotNo == null ? "" : plotNo.trim(); // '' = no plot filter (a null String param breaks LOWER() on Postgres)
        Page<PaymentRow> result = emiInstallmentRepository.findPayments(
            status, fromInstant, toInstant, unbounded, projectId, scoped, ids, plot, PageRequest.of(page, size));
        BigDecimal pageTotal = result.getContent().stream().map(PaymentRow::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal sum = emiInstallmentRepository.sumPayments(status, fromInstant, toInstant, unbounded, projectId,
            scoped, ids, plot);
        return new PaymentPageResponse(result.getContent(), page, size, result.getTotalElements(),
            pageTotal, sum == null ? BigDecimal.ZERO : sum);
    }
}
