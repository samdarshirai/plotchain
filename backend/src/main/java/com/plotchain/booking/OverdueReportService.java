package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;

// Admin overdue-EMI report (plot-booking unit 9). Overdue is derived, never stored (Decision 7):
// "today" is the UTC date of the injected Clock (EPinConfig's Clock.systemUTC()). Page/size are
// clamped by the controller, same split as BookingService.getMyBookings.
@Service
public class OverdueReportService {

    private final PlotBookingRepository plotBookingRepository;
    private final Clock clock;

    public OverdueReportService(PlotBookingRepository plotBookingRepository, Clock clock) {
        this.plotBookingRepository = plotBookingRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public OverdueReportPageResponse getOverdueReport(int page, int size) {
        LocalDate today = LocalDate.now(clock);
        // Unsorted on purpose: the query fixes the order (oldest overdue due date, bookedAt, id).
        Page<OverdueReportRow> result = plotBookingRepository.findOverdueReport(today, PageRequest.of(page, size));
        return new OverdueReportPageResponse(result.getContent(), page, size, result.getTotalElements());
    }
}
