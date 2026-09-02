package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

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

    // hasFreeSlot lets the frontend's Parent Node picker (associate-directory modal) offer only
    // associates with an open Left or Right leg -- derived here from the same full-table fetch
    // rather than a per-associate query, since the whole list is already in hand.
    @GetMapping("/api/associates")
    public List<AssociateSummaryResponse> list() {
        List<Associate> associates = associateRepository.findAllByOrderByUserIdAsc();
        Map<UUID, Set<String>> occupiedPositions = new HashMap<>();
        for (Associate a : associates) {
            if (a.getParentId() != null && a.getPosition() != null) {
                occupiedPositions.computeIfAbsent(a.getParentId(), k -> new HashSet<>()).add(a.getPosition());
            }
        }
        return associates.stream()
            .map(a -> AssociateSummaryResponse.from(a, occupiedPositions.getOrDefault(a.getId(), Set.of()).size() < 2))
            .toList();
    }
}
