package com.plotchain.payments;

import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class PayoutBankAccountService {

    private final PayoutBankAccountRepository payoutBankAccountRepository;

    public PayoutBankAccountService(PayoutBankAccountRepository payoutBankAccountRepository) {
        this.payoutBankAccountRepository = payoutBankAccountRepository;
    }

    public PayoutBankAccountResponse getAccount() {
        return toResponse(currentAccount());
    }

    public PayoutBankAccountResponse updateAccount(PayoutBankAccountRequest request) {
        PayoutBankAccount account = currentAccount();
        account.setBankName(request.bankName());
        account.setAccountHolder(request.accountHolder());
        account.setAccountNumber(request.accountNumber());
        account.setIfscCode(request.ifscCode());
        account.setAccountType(request.accountType());
        account.setUpdatedAt(Instant.now());
        payoutBankAccountRepository.save(account);
        return toResponse(account);
    }

    // All five fields, matching CompanyProfileService.isComplete()'s isNotBlank pattern.
    public boolean isComplete() {
        PayoutBankAccount account = currentAccount();
        return isNotBlank(account.getBankName())
            && isNotBlank(account.getAccountHolder())
            && isNotBlank(account.getAccountNumber())
            && isNotBlank(account.getIfscCode())
            && isNotBlank(account.getAccountType());
    }

    private static boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }

    private PayoutBankAccount currentAccount() {
        return payoutBankAccountRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("payout_bank_account row missing - V9 migration seeds it"));
    }

    private static PayoutBankAccountResponse toResponse(PayoutBankAccount account) {
        return new PayoutBankAccountResponse(
            account.getBankName(),
            account.getAccountHolder(),
            account.getAccountNumber(),
            account.getIfscCode(),
            account.getAccountType(),
            account.getUpdatedAt()
        );
    }
}
