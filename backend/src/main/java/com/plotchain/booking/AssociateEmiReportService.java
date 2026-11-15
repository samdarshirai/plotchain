package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

// Associate "EMI Report": confirmed payments of the caller and everyone in their downline.
// Same rows as the admin EMI Report minus staff names; booking detail hides the buyer's phone.
@Service
public class AssociateEmiReportService {

    private final PlotBookingRepository plotBookingRepository;
    private final AssociateRepository associateRepository;
    private final PaymentLedgerService paymentLedgerService;
    private final BookingService bookingService;

    public AssociateEmiReportService(PlotBookingRepository plotBookingRepository, AssociateRepository associateRepository,
                                     PaymentLedgerService paymentLedgerService, BookingService bookingService) {
        this.plotBookingRepository = plotBookingRepository;
        this.associateRepository = associateRepository;
        this.paymentLedgerService = paymentLedgerService;
        this.bookingService = bookingService;
    }

    // position: null = me + whole team, "L"/"R" = that leg. code: associate login id, blank = anyone in scope.
    @Transactional(readOnly = true)
    public PaymentPageResponse list(UUID me, String position, String code, LocalDate from, LocalDate to, String plotNo,
                                    int page, int size) {
        List<UUID> ids = plotBookingRepository.findSelfAndDownlineIds(me, position);
        if (code != null && !code.isBlank()) {
            String needle = code.trim().toUpperCase(Locale.ROOT);
            ids = associateRepository.findByUserId(needle).map(a -> a.getId()).filter(ids::contains)
                .map(List::of).orElse(List.of());
        }
        if (ids.isEmpty()) {
            return new PaymentPageResponse(List.of(), page, size, 0, java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO);
        }
        PaymentPageResponse r = paymentLedgerService.listConfirmedFor(ids, from, to, plotNo, page, size);
        return new PaymentPageResponse(r.payments().stream().map(PaymentRow::withoutStaff).toList(), r.page(), r.size(),
            r.totalElements(), r.pageTotal(), r.grandTotal());
    }

    // One booking, only if it belongs to me or my downline (404 otherwise, never revealing it exists).
    @Transactional(readOnly = true)
    public BookingResponse booking(UUID me, UUID bookingId) {
        PlotBooking b = plotBookingRepository.findById(bookingId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "booking not found"));
        if (!plotBookingRepository.findSelfAndDownlineIds(me, null).contains(b.getAssociateId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "booking not found");
        }
        return bookingService.getBooking(bookingId).withoutBuyerPhone(true);
    }
}
