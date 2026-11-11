package com.plotchain.booking;

import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleSummaryResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Associate "Pending EMI" report: ACTIVE bookings of everyone in the caller's downline that still
// have a PENDING installment (same definition as the admin register's hasPending). Rows reuse
// BookingService.toResponses, so columns match the admin screen; buyer phone is never exposed.
@Service
public class AssociatePendingEmiService {

    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;
    private final BookingService bookingService;
    private final CycleRepository cycleRepository;

    public AssociatePendingEmiService(PlotBookingRepository plotBookingRepository,
                                      EmiInstallmentRepository emiInstallmentRepository,
                                      BookingService bookingService, CycleRepository cycleRepository) {
        this.plotBookingRepository = plotBookingRepository;
        this.emiInstallmentRepository = emiInstallmentRepository;
        this.bookingService = bookingService;
        this.cycleRepository = cycleRepository;
    }

    // position: null = whole team, "L"/"R" = that leg. code: associate login id, blank = any.
    // cycleId: bookings booked inside that cycle's period (null periodEnd = open-ended).
    @Transactional(readOnly = true)
    public AssociateBookingPageResponse list(UUID me, String position, String code, UUID cycleId, int page, int size) {
        LocalDate from = null;
        LocalDate to = null;
        if (cycleId != null) {
            Cycle c = cycleRepository.findById(cycleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "cycle not found"));
            from = c.getPeriodStart();
            to = c.getPeriodEnd();
        }
        String needle = code == null ? "" : code.trim().toLowerCase(Locale.ROOT);
        Page<PlotBooking> result = plotBookingRepository.findPendingByDownline(me, position, needle,
            BookingService.fromInstant(from), BookingService.toInstant(to), PageRequest.of(page, size, Sort.unsorted()));
        List<UUID> ids = result.getContent().stream().map(PlotBooking::getId).toList();
        Map<UUID, List<EmiInstallment>> byBooking = ids.isEmpty() ? Map.of()
            : emiInstallmentRepository.findByBookingIdInOrderByInstallmentNumberAsc(ids).stream()
                .collect(Collectors.groupingBy(EmiInstallment::getBookingId));
        List<BookingResponse> rows = bookingService.toResponses(result.getContent(), byBooking).stream()
            .map(b -> b.withoutBuyerPhone(true)).toList();
        return new AssociateBookingPageResponse(rows, page, size, result.getTotalElements());
    }

    // Dropdown source for the Cycle filter; period dates are not sensitive.
    @Transactional(readOnly = true)
    public List<CycleSummaryResponse> cycles() {
        return cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 100)).getContent().stream()
            .map(c -> new CycleSummaryResponse(c.getId(), c.getPeriodStart(), c.getPeriodEnd(), c.getStatus())).toList();
    }
}
