package com.plotchain.payments;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PayoutBankAccountServiceTest {

    @Mock PayoutBankAccountRepository payoutBankAccountRepository;

    PayoutBankAccountService payoutBankAccountService;

    @BeforeEach
    void setUp() {
        payoutBankAccountService = new PayoutBankAccountService(payoutBankAccountRepository);
    }

    private PayoutBankAccountRequest filledRequest() {
        return new PayoutBankAccountRequest("HDFC Bank", "Plotchain Estates Pvt Ltd", "50100123456789", "HDFC0001234", "CURRENT");
    }

    @Test
    void updateAccountSavesAllFieldsAndReturnsThem() {
        PayoutBankAccount stored = new PayoutBankAccount();
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));

        PayoutBankAccountResponse response = payoutBankAccountService.updateAccount(filledRequest());

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
