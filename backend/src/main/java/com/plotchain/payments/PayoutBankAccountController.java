package com.plotchain.payments;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/company/payout-account")
public class PayoutBankAccountController {

    private final PayoutBankAccountService payoutBankAccountService;

    public PayoutBankAccountController(PayoutBankAccountService payoutBankAccountService) {
        this.payoutBankAccountService = payoutBankAccountService;
    }

    @GetMapping
    public PayoutBankAccountResponse getAccount() {
        return payoutBankAccountService.getAccount();
    }

    @PutMapping
    public PayoutBankAccountResponse updateAccount(
            @Valid @RequestBody PayoutBankAccountRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return payoutBankAccountService.updateAccount(request, actorId);
    }
}
