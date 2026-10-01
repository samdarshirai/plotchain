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
                                         boolean overdue, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.search(
            status, associateId, plotId, projectId, overdue, LocalDate.now(clock),
            PageRequest.of(page, size, NEWEST_FIRST));

        List<UUID> bookingIds = result.getContent().stream().map(PlotBooking::getId).toList();
        Map<UUID, List<EmiInstallment>> byBooking = bookingIds.isEmpty() ? Map.of()
            : emiInstallmentRepository.findByBookingIdInOrderByInstallmentNumberAsc(bookingIds).stream()
                .collect(Collectors.groupingBy(EmiInstallment::getBookingId));

        List<BookingResponse> rows = result.getContent().stream()
            .map(b -> bookingService.toResponse(b, byBooking.getOrDefault(b.getId(), List.of())))
            .toList();
        return new AdminBookingPageResponse(rows, page, size, result.getTotalElements());
    }
}
