package com.plotchain.payments;

import com.plotchain.company.SettingsAuditService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class PayoutBankAccountService {

    private final PayoutBankAccountRepository payoutBankAccountRepository;
    private final SettingsAuditService settingsAuditService;

    public PayoutBankAccountService(PayoutBankAccountRepository payoutBankAccountRepository,
                                     SettingsAuditService settingsAuditService) {
        this.payoutBankAccountRepository = payoutBankAccountRepository;
        this.settingsAuditService = settingsAuditService;
    }

    public PayoutBankAccountResponse getAccount() {
        return toResponse(currentAccount());
    }

    public PayoutBankAccountResponse updateAccount(PayoutBankAccountRequest request, UUID actorId) {
        PayoutBankAccount account = currentAccount();
        Map<String, Object> before = maskedDetail(account);
        account.setBankName(request.bankName());
        account.setAccountHolder(request.accountHolder());
        account.setAccountNumber(request.accountNumber());
        account.setIfscCode(request.ifscCode());
        account.setAccountType(request.accountType());
        account.setUpdatedAt(Instant.now());
        payoutBankAccountRepository.save(account);
        Map<String, Object> after = maskedDetail(account);
        settingsAuditService.record("PAYMENTS_KYC", "Updated payout bank account",
            Map.of("before", before, "after", after), actorId);
        return toResponse(account);
    }

    // The raw account number must never reach the audit log -- PayoutBankAccountResponse
    // carries it unmasked (unlike PaymentConfigResponse's credentialsConfigured flag), so a
    // dedicated masked detail map is built here instead of serializing the response directly.
    // A LinkedHashMap (not Map.of) is used deliberately: the row is nullable and starts out
    // entirely NULL per the V9 migration seed, and Map.of throws NPE on a null value, which
    // would break the very first payout-account save in production.
    private static Map<String, Object> maskedDetail(PayoutBankAccount account) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("bankName", account.getBankName());
        detail.put("accountHolder", account.getAccountHolder());
        detail.put("maskedAccountNumber", maskAccountNumber(account.getAccountNumber()));
        detail.put("ifscCode", account.getIfscCode());
        detail.put("accountType", account.getAccountType());
        return detail;
    }

    private static String maskAccountNumber(String value) {
        if (value == null) {
            return null;
        }
        return "*".repeat(Math.max(0, value.length() - 4)) + value.substring(Math.max(0, value.length() - 4));
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
