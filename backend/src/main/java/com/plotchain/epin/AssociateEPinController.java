package com.plotchain.epin;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/associates/me/epins")
public class AssociateEPinController {

    private static final String UNLOCK_HEADER = "X-Epin-Unlock";

    private final EPinService epinService;
    private final EPinUnlockStore unlockStore;

    private final com.plotchain.associate.TransactionPasswordGuard transactionPasswordGuard;

    public AssociateEPinController(EPinService epinService, EPinUnlockStore unlockStore,
                                   com.plotchain.associate.TransactionPasswordGuard transactionPasswordGuard) {
        this.epinService = epinService;
        this.unlockStore = unlockStore;
        this.transactionPasswordGuard = transactionPasswordGuard;
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
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        return epinService.redeemOwn(id, request.userId(), associateId);
    }

    @PostMapping("/{id}/join")
    public JoinEPinResponse join(@PathVariable UUID id, @Valid @RequestBody JoinEPinRequest request,
                                 @AuthenticationPrincipal UUID associateId,
                                 @RequestHeader(value = UNLOCK_HEADER, required = false) String unlock) {
        unlockStore.require(associateId, unlock);
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        return epinService.join(id, request, associateId);
    }

    @PostMapping("/{id}/transfer")
    public EPinResponse transfer(@PathVariable UUID id, @Valid @RequestBody TransferEPinRequest request,
                                 @AuthenticationPrincipal UUID associateId) {
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        return epinService.transfer(id, request.toUserId(), associateId);
    }

    // e-Pin Register screens sit behind the transaction password: unlock once, then send the
    // returned token as X-Epin-Unlock on the register endpoints below.
    @PostMapping("/unlock")
    public EPinUnlockResponse unlock(@RequestBody EPinUnlockRequest request, @AuthenticationPrincipal UUID associateId) {
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        return unlockStore.issue(associateId);
    }

    @GetMapping("/unused")
    public EPinRowPage<EPinUnusedRow> unused(
            @AuthenticationPrincipal UUID associateId, @RequestHeader(value = UNLOCK_HEADER, required = false) String unlock,
            @RequestParam(required = false) EPinType type, @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "false") boolean masked,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        unlockStore.require(associateId, unlock);
        return epinService.unused(associateId, type, q, masked, Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    @GetMapping("/used")
    public EPinRowPage<EPinUsedRow> used(
            @AuthenticationPrincipal UUID associateId, @RequestHeader(value = UNLOCK_HEADER, required = false) String unlock,
            @RequestParam(required = false) EPinType type, @RequestParam(defaultValue = "") String q,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        unlockStore.require(associateId, unlock);
        return epinService.used(associateId, type, q, Math.max(page, 0), Math.min(Math.max(size, 1), 100));
    }

    @GetMapping("/recipient/{userId}")
    public EPinRecipientResponse recipient(
            @PathVariable String userId, @AuthenticationPrincipal UUID associateId,
            @RequestHeader(value = UNLOCK_HEADER, required = false) String unlock) {
        unlockStore.require(associateId, unlock);
        return epinService.recipient(userId, associateId);
    }

    @PostMapping("/transfer-bulk")
    public BulkTransferEPinResponse transferBulk(
            @Valid @RequestBody BulkTransferEPinRequest request, @AuthenticationPrincipal UUID associateId,
            @RequestHeader(value = UNLOCK_HEADER, required = false) String unlock) {
        unlockStore.require(associateId, unlock);
        transactionPasswordGuard.require(associateId, request.transactionPassword());
        return epinService.transferBulk(request, associateId);
    }
}
