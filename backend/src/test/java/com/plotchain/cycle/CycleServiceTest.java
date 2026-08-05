package com.plotchain.cycle;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CycleServiceTest {

    @Mock CycleRepository cycleRepository;
    CycleService service;

    private Cycle newCycle(CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(status);
        return cycle;
    }

    private Cycle newCycleWithBounds(LocalDate start, LocalDate end, CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(start);
        cycle.setPeriodEnd(end);
        cycle.setStatus(status);
        return cycle;
    }

    private LocalDate expectedPeriodStart(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate expectedPeriodEnd(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }

    @Test
    void listWithNoStatusFilterDelegatesToFindAll() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(cycle), PageRequest.of(0, 20), 1));

        CyclePageResponse response = service.list(null, 0, 20);

        assertThat(response.cycles()).hasSize(1);
        assertThat(response.cycles().get(0).id()).isEqualTo(cycle.getId());
        assertThat(response.cycles().get(0).periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.cycles().get(0).periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.cycles().get(0).status()).isEqualTo(CycleStatus.OPEN);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
    }

    @Test
    void listWithStatusFilterDelegatesToFindByStatus() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED, PageRequest.of(1, 10)))
            .thenReturn(new PageImpl<>(List.of(cycle), PageRequest.of(1, 10), 11));

        CyclePageResponse response = service.list(CycleStatus.CLOSED, 1, 10);

        assertThat(response.cycles()).extracting(CycleSummaryResponse::status).containsExactly(CycleStatus.CLOSED);
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(10);
        assertThat(response.totalElements()).isEqualTo(11);
    }

    @Test
    void closeThrowsCycleNotFoundExceptionWhenTheCycleDoesNotExist() {
        service = new CycleService(cycleRepository);
        UUID id = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.close(id)).isInstanceOf(CycleNotFoundException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsClosed() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsPaid() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.PAID);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeSucceedsAndReturnsAPlaceholderResponseWhenStatusIsOpen() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        CycleCloseResponse response = service.close(cycle.getId());

        assertThat(response.cycleId()).isEqualTo(cycle.getId());
        assertThat(response.status()).isEqualTo(CycleStatus.OPEN);
    }

    @Test
    void getOrOpenCurrentCreatesANewCycleWhenNoCycleCoversToday() {
        service = new CycleService(cycleRepository);
        LocalDate today = LocalDate.now();
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getPeriodStart()).isEqualTo(expectedPeriodStart(today));
        assertThat(result.getPeriodEnd()).isEqualTo(expectedPeriodEnd(today));
        assertThat(result.getStatus()).isEqualTo(CycleStatus.OPEN);
        assertThat(result.getId()).isNotNull();
        verify(cycleRepository).save(any(Cycle.class));
    }

    @Test
    void getOrOpenCurrentReturnsTheExistingOpenCycleWhenItCoversToday() {
        service = new CycleService(cycleRepository);
        LocalDate today = LocalDate.now();
        Cycle existing = newCycleWithBounds(expectedPeriodStart(today), expectedPeriodEnd(today), CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(existing));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getId()).isEqualTo(existing.getId());
        verify(cycleRepository, never()).save(any(Cycle.class));
    }

    @Test
    void getOrOpenCurrentCreatesTheNextCycleWhenTheExistingOpenCycleDoesNotCoverToday() {
        service = new CycleService(cycleRepository);
        LocalDate today = LocalDate.now();
        // Deliberately a stale period comfortably in the past relative to "today", regardless
        // of which day-of-month the test happens to run on: [-40, -26] days never overlaps
        // today's computed [periodStart, periodEnd] window (that window is at most 31 days wide
        // and always includes today itself).
        Cycle stale = newCycleWithBounds(today.minusDays(40), today.minusDays(26), CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(stale));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getId()).isNotEqualTo(stale.getId());
        assertThat(result.getPeriodStart()).isEqualTo(expectedPeriodStart(today));
        assertThat(result.getPeriodEnd()).isEqualTo(expectedPeriodEnd(today));
        assertThat(result.getStatus()).isEqualTo(CycleStatus.OPEN);
        verify(cycleRepository).save(any(Cycle.class));
    }
}
