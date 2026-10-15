package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Plot-booking unit 8 (spec Flow "Admin register", Decision 11). Separate from BookingService on
// purpose: units 6/7 edit BookingService, this read path must not conflict with them. Rows are
// mapped by BookingService.toResponse (package-private, takes preloaded installments), so the
// overdue flag has one Java definition; the filter's overdue definition is BookingOverdue (JPQL).
@Service
public class BookingRegisterService {

    // booked_at DESC (Resolved decision #8); id DESC makes ties deterministic across pages.
    private static final Sort NEWEST_FIRST =
        Sort.by(Sort.Direction.DESC, "bookedAt").and(Sort.by(Sort.Direction.DESC, "id"));

    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;
    private final BookingService bookingService;
    private final Clock clock;

    public BookingRegisterService(PlotBookingRepository plotBookingRepository,
                                  EmiInstallmentRepository emiInstallmentRepository,
                                  BookingService bookingService, Clock clock) {
        this.plotBookingRepository = plotBookingRepository;
        this.emiInstallmentRepository = emiInstallmentRepository;
        this.bookingService = bookingService;
        this.clock = clock;
    }

    // page/size must already be clamped by the caller (controller).
    @Transactional(readOnly = true)
    public AdminBookingPageResponse list(BookingStatus status, UUID associateId, UUID plotId, UUID projectId,
                                         boolean overdue, LocalDate bookedFrom, LocalDate bookedTo,
                                         LocalDate cancelledFrom, LocalDate cancelledTo, String q,
                                         int page, int size) {
        boolean cancelledFilter = cancelledFrom != null || cancelledTo != null;
        String needle = q == null ? "" : q.trim().toLowerCase(java.util.Locale.ROOT);
        Page<PlotBooking> result = plotBookingRepository.search(
            status, associateId, plotId, projectId, overdue, LocalDate.now(clock),
            BookingService.fromInstant(bookedFrom), BookingService.toInstant(bookedTo),
            cancelledFilter, BookingService.fromInstant(cancelledFrom), BookingService.toInstant(cancelledTo),
            needle, PageRequest.of(page, size, NEWEST_FIRST));

        return toPage(result, page, size);
    }

    @Transactional(readOnly = true)
    public AdminBookingPageResponse listTransferred(int page, int size) {
        return toPage(plotBookingRepository.findTransferred(PageRequest.of(page, size, NEWEST_FIRST)), page, size);
    }

    private AdminBookingPageResponse toPage(Page<PlotBooking> result, int page, int size) {
        List<UUID> bookingIds = result.getContent().stream().map(PlotBooking::getId).toList();
        Map<UUID, List<EmiInstallment>> byBooking = bookingIds.isEmpty() ? Map.of()
            : emiInstallmentRepository.findByBookingIdInOrderByInstallmentNumberAsc(bookingIds).stream()
                .collect(Collectors.groupingBy(EmiInstallment::getBookingId));
        return new AdminBookingPageResponse(bookingService.toResponses(result.getContent(), byBooking), page, size, result.getTotalElements());
    }
}
