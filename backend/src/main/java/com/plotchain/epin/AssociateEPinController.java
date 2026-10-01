package com.plotchain.epin;

import jakarta.validation.Valid;
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
@RequestMapping("/api/associates/me/epins")
public class AssociateEPinController {

    private final EPinService epinService;

    public AssociateEPinController(EPinService epinService) {
        this.epinService = epinService;
    }

    // Self-scoped by construction: the associate id comes only from the JWT principal. There is
    // deliberately no redeemedTo/allocatedTo parameter, so no way to ask for someone else's pins.
    @GetMapping
    public EPinPageResponse myEpins(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) EPinStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return epinService.listForAssociate(associateId, status, page, size);
    }

    @PostMapping("/{id}/redeem")
    public EPinResponse redeem(@PathVariable UUID id, @Valid @RequestBody AssociateRedeemEPinRequest request,
                               @AuthenticationPrincipal UUID associateId) {
        return epinService.redeemOwn(id, request.userId(), associateId);
    }

    @PostMapping("/{id}/transfer")
    public EPinResponse transfer(@PathVariable UUID id, @Valid @RequestBody TransferEPinRequest request,
                                 @AuthenticationPrincipal UUID associateId) {
        return epinService.transfer(id, request.toUserId(), associateId);
    }
}
