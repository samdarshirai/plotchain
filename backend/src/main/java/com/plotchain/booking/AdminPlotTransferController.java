package com.plotchain.booking;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.UUID;

// GET has its own exact-path ADMIN matcher in SecurityConfig (no blanket GET /api/admin/**).
@RestController
@RequestMapping("/api/admin/plot-transfers")
public class AdminPlotTransferController {

    private final BookingEventRepository bookingEventRepository;

    public AdminPlotTransferController(BookingEventRepository bookingEventRepository) {
        this.bookingEventRepository = bookingEventRepository;
    }

    @GetMapping
    public PlotTransferPageResponse list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);
        var result = bookingEventRepository.findPlotTransfers(
            BookingService.fromInstant(from), BookingService.toInstant(to), projectId,
            org.springframework.data.domain.PageRequest.of(page, size));
        return new PlotTransferPageResponse(result.getContent(), page, size, result.getTotalElements());
    }
}
