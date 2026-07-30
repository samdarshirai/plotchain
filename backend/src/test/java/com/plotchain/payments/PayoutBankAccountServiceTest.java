package com.plotchain.payments;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PayoutBankAccountServiceTest {

    @Mock PayoutBankAccountRepository payoutBankAccountRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern. Audit calls are
    // asserted via the settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    PayoutBankAccountService payoutBankAccountService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        payoutBankAccountService = new PayoutBankAccountService(payoutBankAccountRepository, settingsAuditService);
    }

    private PayoutBankAccountRequest filledRequest() {
        return new PayoutBankAccountRequest("HDFC Bank", "Plotchain Estates Pvt Ltd", "50100123456789", "HDFC0001234", "CURRENT");
    }

    @Test
    void updateAccountSavesAllFieldsAndReturnsThem() {
        PayoutBankAccount stored = new PayoutBankAccount();
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));

        PayoutBankAccountResponse response = payoutBankAccountService.updateAccount(filledRequest(), ACTOR_ID);

        ArgumentCaptor<PayoutBankAccount> captor = ArgumentCaptor.forClass(PayoutBankAccount.class);
        verify(payoutBankAccountRepository).save(captor.capture());
        PayoutBankAccount saved = captor.getValue();
        assertThat(saved.getBankName()).isEqualTo("HDFC Bank");
        assertThat(saved.getAccountHolder()).isEqualTo("Plotchain Estates Pvt Ltd");
        assertThat(saved.getAccountNumber()).isEqualTo("50100123456789");
        assertThat(saved.getIfscCode()).isEqualTo("HDFC0001234");
        assertThat(saved.getAccountType()).isEqualTo("CURRENT");
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(response.ifscCode()).isEqualTo("HDFC0001234");
    }

    @Test
    void updateAccountRecordsAnAuditEntryWithAMaskedAccountNumber() {
        PayoutBankAccount stored = new PayoutBankAccount();
        stored.setBankName("Old Bank");
        stored.setAccountNumber("11112222333344");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));

        payoutBankAccountService.updateAccount(filledRequest(), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PAYMENTS_KYC");
        assertThat(saved.getSummary()).isEqualTo("Updated payout bank account");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"maskedAccountNumber\":\"**********3344\"")
            .contains("\"maskedAccountNumber\":\"**********6789\"");
        // The full raw account numbers (before AND after) must never appear in the audit detail --
        // only the masked form. This is the specific regression this test guards against.
        assertThat(saved.getDetail()).doesNotContain("11112222333344").doesNotContain("50100123456789");
    }

    @Test
    void isCompleteIsFalseWhenAllFieldsAreBlank() {
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(new PayoutBankAccount()));

        assertThat(payoutBankAccountService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsFalseWhenOneFieldIsMissing() {
        PayoutBankAccount stored = new PayoutBankAccount();
        stored.setBankName("HDFC Bank");
        stored.setAccountHolder("Plotchain Estates Pvt Ltd");
        stored.setAccountNumber("50100123456789");
        stored.setIfscCode("HDFC0001234");
        // accountType deliberately left blank
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));

        assertThat(payoutBankAccountService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWhenAllFieldsAreFilled() {
        PayoutBankAccount stored = new PayoutBankAccount();
        stored.setBankName("HDFC Bank");
        stored.setAccountHolder("Plotchain Estates Pvt Ltd");
        stored.setAccountNumber("50100123456789");
        stored.setIfscCode("HDFC0001234");
        stored.setAccountType("CURRENT");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));

        assertThat(payoutBankAccountService.isComplete()).isTrue();
    }
}
