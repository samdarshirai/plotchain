package com.plotchain.epin;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/admin/epins")
public class EPinController {

    private final EPinService epinService;

    public EPinController(EPinService epinService) {
        this.epinService = epinService;
    }

    @PostMapping
    public ResponseEntity<EPinBatchResponse> generateBatch(
            @Valid @RequestBody CreateEPinBatchRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(epinService.generateBatch(request, actorId));
    }

    // epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Admin register", Decision 13): same page/size clamp convention as
    // AdminAssociateController.list/LedgerController.list -- clamped here, not left to
    // EPinService, so every caller of EPinService.list (there is only this one today) still has
    // to pass an already-clamped page/size, same division of responsibility as those two
    // controllers.
    @GetMapping
    public EPinPageResponse list(
            @RequestParam(required = false) EPinStatus status,
            @RequestParam(required = false) UUID redeemedTo,
            @RequestParam(required = false) UUID batchId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return epinService.list(status, redeemedTo, batchId, page, size);
    }

    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Decision 10: the path parameter is the EPin's id, not its code): guard-only wiring --
    // EPinService.redeem still ends in a placeholder throw until epin-domain unit 4 lands.
    @PostMapping("/{id}/redeem")
    public ResponseEntity<EPinResponse> redeem(
            @PathVariable UUID id,
            @Valid @RequestBody RedeemEPinRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.ok(epinService.redeem(id, request, actorId));
    }
}
