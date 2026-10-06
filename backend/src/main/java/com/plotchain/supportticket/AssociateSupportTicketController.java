package com.plotchain.supportticket;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Bare @RestController (no class-level @RequestMapping), same shape as AssociateBookingController.
// Self-scoped by construction: associateId only ever comes from the verified JWT. No SecurityConfig
// matcher: a bare GET falls through to anyRequest().authenticated(), like GET
// /api/associates/me/bookings. ADMIN tokens reach it ungated (spec Resolved decision 1).
@RestController
public class AssociateSupportTicketController {

    private final AssociateSupportTicketService associateSupportTicketService;

    public AssociateSupportTicketController(AssociateSupportTicketService associateSupportTicketService) {
        this.associateSupportTicketService = associateSupportTicketService;
    }

    @GetMapping("/api/associates/me/support-tickets")
    public SupportTicketPageResponse myTickets(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) SupportTicketStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.max(Math.min(size, 100), 1);
        return associateSupportTicketService.myTickets(associateId, status, page, size);
    }
}
