package com.plotchain.supportticket;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/support-tickets")
public class AdminSupportTicketController {

    private final AdminSupportTicketService adminSupportTicketService;

    public AdminSupportTicketController(AdminSupportTicketService adminSupportTicketService) {
        this.adminSupportTicketService = adminSupportTicketService;
    }

    // 201 like the other admin "create on an associate's behalf" POSTs (SaleController.record,
    // BookingController.create). Defense-in-depth @PreAuthorize alongside the blanket
    // POST /api/** -> ADMIN rule in SecurityConfig, same as KycReviewController (Decision 8).
    @PostMapping
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<SupportTicketResponse> create(@Valid @RequestBody CreateSupportTicketRequest request,
                                                        @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(adminSupportTicketService.create(request, actorId));
    }
}
