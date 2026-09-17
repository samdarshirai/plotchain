package com.plotchain.epin;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EPinServiceTest {

    @Mock EPinRepository epinRepository;

    // Field-initializer order note (same reasoning as SaleServiceTest's setUp()): a
    // `= new EPinService(epinRepository)` initializer here would run during instance
    // construction, before MockitoExtension's beforeEach() injects the @Mock field, capturing a
    // still-null epinRepository. Constructing epinService in @BeforeEach avoids that.
    EPinService epinService;

    @BeforeEach
    void setUp() {
        epinService = new EPinService(epinRepository);
    }

    @Test
    void generateBatchProducesTheRequestedCountOfRowsSharingOneBatchIdAllUnused() {
        when(epinRepository.existsByCode(any())).thenReturn(false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        UUID actorId = UUID.randomUUID();

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(3), actorId);

        verify(epinRepository, times(3)).save(captor.capture());
        List<EPin> saved = captor.getAllValues();
        assertThat(saved).hasSize(3);
        assertThat(saved).extracting(EPin::getBatchId).containsOnly(saved.get(0).getBatchId());
        assertThat(saved).allMatch(e -> e.getStatus() == EPinStatus.UNUSED);
        assertThat(saved).allMatch(e -> e.getGeneratedBy().equals(actorId));
        assertThat(saved).allMatch(e -> e.getGeneratedAt() != null);
        assertThat(saved).extracting(EPin::getCode).doesNotHaveDuplicates();

        assertThat(response.batchId()).isEqualTo(saved.get(0).getBatchId());
        assertThat(response.count()).isEqualTo(3);
        assertThat(response.codes()).hasSize(3);
        assertThat(response.generatedAt()).isNotNull();
    }

    @Test
    void generateBatchRetriesOnACodeCollisionAndStillProducesTheRequestedRow() {
        // First existsByCode call simulates a collision (Decision 3); the retry's second call
        // reports no collision, so the loop must still produce exactly one saved row.
        when(epinRepository.existsByCode(any())).thenReturn(true, false);
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinBatchResponse response = epinService.generateBatch(new CreateEPinBatchRequest(1), UUID.randomUUID());

        assertThat(response.codes()).hasSize(1);
        verify(epinRepository, times(2)).existsByCode(any());
        verify(epinRepository, times(1)).save(any());
    }
}
