package com.plotchain.payments;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/booking-emi")
public class BookingEmiConfigController {

    private final BookingEmiConfigService bookingEmiConfigService;

    public BookingEmiConfigController(BookingEmiConfigService bookingEmiConfigService) {
        this.bookingEmiConfigService = bookingEmiConfigService;
    }

    @GetMapping
    public BookingEmiConfigResponse getConfig() {
        return bookingEmiConfigService.getConfig();
    }

    @PutMapping
    public BookingEmiConfigResponse updateConfig(
            @Valid @RequestBody BookingEmiConfigRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return bookingEmiConfigService.updateConfig(request, actorId);
    }
}
