package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

// Reachable by ADMIN only — SecurityConfig gates every POST /api/** behind hasAuthority("ADMIN").
@RestController
public class AssociateController {

    private final AssociateProvisioningService provisioningService;

    public AssociateController(AssociateProvisioningService provisioningService) {
        this.provisioningService = provisioningService;
    }

    @PostMapping("/api/associates")
    public ResponseEntity<CreateAssociateResponse> create(@Valid @RequestBody CreateAssociateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(provisioningService.create(request));
    }
}
