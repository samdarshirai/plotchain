package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateBankDetailsServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock AssociateBankDetailsRepository associateBankDetailsRepository;

    AssociateBankDetailsService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new AssociateBankDetailsService(associateRepository, associateBankDetailsRepository);
    }

    private Associate seededAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    private AssociateBankDetails seededBankDetails() {
        AssociateBankDetails d = new AssociateBankDetails();
        d.setId(UUID.randomUUID());
        d.setAssociateId(ASSOCIATE_ID);
        d.setBankName("State Bank");
        d.setAccountHolder("Jane Doe");
        d.setAccountNumber("123456789012");
        d.setIfscCode("SBIN0001234");
        d.setAccountType("SAVINGS");
        return d;
    }

    private UpdateAssociateBankDetailsRequest validRequest() {
        return new UpdateAssociateBankDetailsRequest(
            "State Bank", "Jane Doe", "123456789012", "SBIN0001234", "SAVINGS");
    }

    @Test
    void getBankDetailsReturnsEmptyFieldsWhenNoRowExistsYet() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associateBankDetailsRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());

        AssociateBankDetailsResponse response = service.getBankDetails(ASSOCIATE_ID);

        assertThat(response.bankName()).isNull();
        assertThat(response.accountHolder()).isNull();
        assertThat(response.accountNumber()).isNull();
        assertThat(response.ifscCode()).isNull();
        assertThat(response.accountType()).isNull();
        assertThat(response.updatedAt()).isNull();
    }

    @Test
    void getBankDetailsReturnsExistingRow() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associateBankDetailsRepository.findByAssociateId(ASSOCIATE_ID))
            .thenReturn(Optional.of(seededBankDetails()));

        AssociateBankDetailsResponse response = service.getBankDetails(ASSOCIATE_ID);

        assertThat(response.bankName()).isEqualTo("State Bank");
        assertThat(response.accountHolder()).isEqualTo("Jane Doe");
        assertThat(response.accountNumber()).isEqualTo("123456789012");
        assertThat(response.ifscCode()).isEqualTo("SBIN0001234");
        assertThat(response.accountType()).isEqualTo("SAVINGS");
    }

    @Test
    void getBankDetailsThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getBankDetails(ASSOCIATE_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void updateBankDetailsCreatesANewRowWhenNoneExists() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associateBankDetailsRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());
        when(associateBankDetailsRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AssociateBankDetailsResponse response = service.updateBankDetails(ASSOCIATE_ID, validRequest());

        assertThat(response.bankName()).isEqualTo("State Bank");
        assertThat(response.accountNumber()).isEqualTo("123456789012");
        assertThat(response.updatedAt()).isNotNull();
    }

    @Test
    void updateBankDetailsOverwritesAnExistingRow() {
        AssociateBankDetails existing = seededBankDetails();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seededAssociate()));
        when(associateBankDetailsRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.of(existing));
        when(associateBankDetailsRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        UpdateAssociateBankDetailsRequest request =
            new UpdateAssociateBankDetailsRequest("HDFC Bank", "Jane Doe", "987654321098", "HDFC0001234", "CURRENT");

        AssociateBankDetailsResponse response = service.updateBankDetails(ASSOCIATE_ID, request);

        assertThat(response.bankName()).isEqualTo("HDFC Bank");
        assertThat(response.accountNumber()).isEqualTo("987654321098");
        assertThat(response.ifscCode()).isEqualTo("HDFC0001234");
        assertThat(response.accountType()).isEqualTo("CURRENT");
        assertThat(existing.getBankName()).isEqualTo("HDFC Bank");
        verify(associateBankDetailsRepository).save(existing);
    }

    @Test
    void updateBankDetailsThrowsWhenAssociateNotFound() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.updateBankDetails(ASSOCIATE_ID, validRequest()))
            .isInstanceOf(AssociateNotFoundException.class);
        verify(associateBankDetailsRepository, never()).save(any());
    }
}
