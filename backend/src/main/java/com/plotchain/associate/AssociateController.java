package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

// Reachable by admin-family roles only — SecurityConfig gates POST /api/** behind the blanket
// write rule and GET /api/associates behind its own admin-family matcher.
@RestController
public class AssociateController {

    private final AssociateProvisioningService provisioningService;
    private final AssociateRepository associateRepository;

    public AssociateController(AssociateProvisioningService provisioningService, AssociateRepository associateRepository) {
        this.provisioningService = provisioningService;
        this.associateRepository = associateRepository;
    }

    @PostMapping("/api/associates")
    public ResponseEntity<CreateAssociateResponse> create(@Valid @RequestBody CreateAssociateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(provisioningService.create(request));
    }

    @GetMapping("/api/associates")
    public List<AssociateSummaryResponse> list() {
        return associateRepository.findAllByOrderByUserIdAsc().stream()
            .map(AssociateSummaryResponse::from)
            .toList();
    }
}
