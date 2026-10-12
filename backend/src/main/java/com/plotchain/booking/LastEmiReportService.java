package com.plotchain.booking;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Admin "EMI by last date" report (U3). Paid counts PAID installments only; ENTERED/PENDING sit in Rest.
@Service
public class LastEmiReportService {

    private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;

    public LastEmiReportService(PlotBookingRepository plotBookingRepository,
                                EmiInstallmentRepository emiInstallmentRepository) {
        this.plotBookingRepository = plotBookingRepository;
        this.emiInstallmentRepository = emiInstallmentRepository;
    }

    // ponytail: unpaged list, add paging if a date range ever returns thousands of bookings
    @Transactional(readOnly = true)
    public List<LastEmiRow> report(LocalDate from, LocalDate to, UUID projectId) {
        List<LastEmiHead> heads = plotBookingRepository.findLastEmiHeads(
            from == null ? MIN_DATE : from, to == null ? MAX_DATE : to, projectId);
        if (heads.isEmpty()) { return List.of(); }
        Map<UUID, BigDecimal> paidByBooking = emiInstallmentRepository
            .findByBookingIdInOrderByInstallmentNumberAsc(heads.stream().map(LastEmiHead::bookingId).toList())
            .stream().filter(i -> i.getStatus() == InstallmentStatus.PAID)
            .collect(Collectors.groupingBy(EmiInstallment::getBookingId,
                Collectors.reducing(BigDecimal.ZERO, EmiInstallment::getAmount, BigDecimal::add)));
        return heads.stream().map(h -> {
            BigDecimal paid = paidByBooking.getOrDefault(h.bookingId(), BigDecimal.ZERO);
            return new LastEmiRow(h.bookingId(), h.bookedAt(), h.associateCode(), h.associateName(), h.buyerName(),
                h.buyerPhone(), h.plotNo(), h.projectName(), h.lastDueDate(), h.discount(), h.total(),
                paid, h.total().subtract(paid));
        }).toList();
    }
}
