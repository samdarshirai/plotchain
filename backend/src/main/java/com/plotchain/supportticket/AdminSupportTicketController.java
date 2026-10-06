package com.plotchain.supportticket;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/support-tickets")
public class AdminSupportTicketController {

    private final AdminSupportTicketService adminSupportTicketService;

    public AdminSupportTicketController(AdminSupportTicketService adminSupportTicketService) {
        this.adminSupportTicketService = adminSupportTicketService;
    }

    // Admin queue (support-tickets unit 2). status and associateId are independently optional; no
    // default status filter. Clamp: page >= 0, size in [1, 100] (PageRequest.of rejects size < 1).
    // ADMIN-only via the explicit GET matcher in SecurityConfig; no @PreAuthorize on reads, same
    // as KycReviewController.list.
    @GetMapping
    public SupportTicketPageResponse list(
            @RequestParam(required = false) SupportTicketStatus status,
            @RequestParam(required = false) UUID associateId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);
        return adminSupportTicketService.list(status, associateId, page, size);
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

    // Defense-in-depth @PreAuthorize alongside the blanket POST /api/** -> ADMIN rule (Decision 8).
    @PostMapping("/{id}/respond")
    @PreAuthorize("hasAuthority('ADMIN')")
    public SupportTicketResponse respond(@PathVariable UUID id,
                                         @Valid @RequestBody RespondToSupportTicketRequest request,
                                         @AuthenticationPrincipal UUID actorId) {
        return adminSupportTicketService.respond(id, request, actorId);
    }
}
