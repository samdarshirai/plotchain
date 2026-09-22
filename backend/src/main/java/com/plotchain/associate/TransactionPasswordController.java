package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Self-scoped by construction, same pattern as PasswordController (/api/associates/me/password,
// the login-password sibling of this unit): the target associate always comes from the verified
// JWT (@AuthenticationPrincipal), never a path/query/body parameter.
@RestController
@RequestMapping("/api/associates/me/transaction-password")
public class TransactionPasswordController {

    private final TransactionPasswordService transactionPasswordService;

    public TransactionPasswordController(TransactionPasswordService transactionPasswordService) {
        this.transactionPasswordService = transactionPasswordService;
    }

    @GetMapping
    public TransactionPasswordStatusResponse getStatus(@AuthenticationPrincipal UUID associateId) {
        return transactionPasswordService.getStatus(associateId);
    }

    @PostMapping
    public ResponseEntity<Void> setPassword(
        @AuthenticationPrincipal UUID associateId,
        @Valid @RequestBody SetTransactionPasswordRequest request
    ) {
        transactionPasswordService.setPassword(associateId, request);
        return ResponseEntity.noContent().build();
    }
}
