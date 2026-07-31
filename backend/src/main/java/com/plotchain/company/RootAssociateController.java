package com.plotchain.company;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/root-associates")
public class RootAssociateController {

    private final RootAssociateProvisioningService rootAssociateProvisioningService;

    public RootAssociateController(RootAssociateProvisioningService rootAssociateProvisioningService) {
        this.rootAssociateProvisioningService = rootAssociateProvisioningService;
    }

    @PostMapping
    public ResponseEntity<CreateRootAssociateResponse> create(
            @Valid @RequestBody CreateRootAssociateRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(rootAssociateProvisioningService.create(request, actorId));
    }

    @GetMapping
    public RootAssociateSlotsResponse list() {
        return rootAssociateProvisioningService.list();
    }
}
