package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

// Admin payments list (U3): unconfirmed queue (ENTERED) or confirmed ledger (PAID), date filter on paid_at.
@Service
public class PaymentLedgerService {

    private final EmiInstallmentRepository emiInstallmentRepository;

    public PaymentLedgerService(EmiInstallmentRepository emiInstallmentRepository) {
        this.emiInstallmentRepository = emiInstallmentRepository;
    }

    // page/size must already be clamped by the caller (controller).
    @Transactional(readOnly = true)
    public PaymentPageResponse list(InstallmentStatus status, LocalDate from, LocalDate to, UUID projectId,
                                    int page, int size) {
        var fromInstant = BookingService.fromInstant(from);
        var toInstant = BookingService.toInstant(to);
        Page<PaymentRow> result = emiInstallmentRepository.findPayments(
            status, fromInstant, toInstant, projectId, PageRequest.of(page, size));
        BigDecimal pageTotal = result.getContent().stream().map(PaymentRow::amount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal sum = emiInstallmentRepository.sumPayments(status, fromInstant, toInstant, projectId);
        return new PaymentPageResponse(result.getContent(), page, size, result.getTotalElements(),
            pageTotal, sum == null ? BigDecimal.ZERO : sum);
    }
}
