package com.plotchain.announcement;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// Full paths on methods (no class-level mapping): the feed GET /api/announcements does not share the /api/admin prefix.
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

    // Any authenticated user (ADMIN or any associate role): deliberately NO @PreAuthorize and no
    // SecurityConfig matcher; a bare GET falls through to anyRequest().authenticated() (spec
    // Decision 4). Clamp matches AssociateSupportTicketController: size >= 1 because PageRequest.of
    // throws below 1; the 20 default is the backend's, the screens pick their own size.
    @GetMapping("/api/announcements")
    public AnnouncementPageResponse feed(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.max(Math.min(size, 100), 1);
        return announcementService.feed(page, size);
    }
}
