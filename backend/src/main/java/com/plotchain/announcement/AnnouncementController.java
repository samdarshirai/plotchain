package com.plotchain.announcement;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// Full paths on methods (no class-level mapping): unit 2 appends GET /api/announcements here, which
// does not share the /api/admin prefix.
@RestController
public class AnnouncementController {

    private final AnnouncementService announcementService;

    public AnnouncementController(AnnouncementService announcementService) {
        this.announcementService = announcementService;
    }

    // 201 like the other admin creates (AdminSupportTicketController.create, SaleController.record).
    // Defense-in-depth @PreAuthorize alongside the blanket POST /api/** -> ADMIN rule in SecurityConfig.
    @PostMapping("/api/admin/announcements")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<AnnouncementResponse> compose(@Valid @RequestBody CreateAnnouncementRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(announcementService.compose(request));
    }
}
