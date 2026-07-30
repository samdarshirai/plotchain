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
class KycConfigServiceTest {

    @Mock KycConfigRepository kycConfigRepository;

    KycConfigService kycConfigService;

    @BeforeEach
    void setUp() {
        kycConfigService = new KycConfigService(kycConfigRepository);
    }

    @Test
    void getConfigSplitsRequiredDocumentsIntoAList() {
        KycConfig stored = new KycConfig();
        stored.setStrictness("STRICT");
        stored.setRequiredDocuments("AADHAAR,PAN,BANK_PASSBOOK");
        when(kycConfigRepository.findAll()).thenReturn(List.of(stored));

        KycConfigResponse response = kycConfigService.getConfig();

        assertThat(response.strictness()).isEqualTo("STRICT");
        assertThat(response.requiredDocuments()).containsExactly("AADHAAR", "PAN", "BANK_PASSBOOK");
    }

    @Test
    void updateConfigJoinsRequiredDocumentsIntoACommaString() {
        KycConfig stored = new KycConfig();
        stored.setStrictness("STRICT");
        stored.setRequiredDocuments("AADHAAR,PAN,BANK_PASSBOOK");
        when(kycConfigRepository.findAll()).thenReturn(List.of(stored));

        KycConfigResponse response = kycConfigService.updateConfig(
            new KycConfigRequest("RELAXED", List.of("AADHAAR", "PAN")));

        ArgumentCaptor<KycConfig> captor = ArgumentCaptor.forClass(KycConfig.class);
        verify(kycConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getStrictness()).isEqualTo("RELAXED");
        assertThat(captor.getValue().getRequiredDocuments()).isEqualTo("AADHAAR,PAN");
        assertThat(response.requiredDocuments()).containsExactly("AADHAAR", "PAN");
    }
}
