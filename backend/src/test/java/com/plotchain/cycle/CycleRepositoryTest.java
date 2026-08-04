package com.plotchain.cycle;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class CycleRepositoryTest {

    @Autowired
    CycleRepository cycleRepository;

    private Cycle newCycle(LocalDate start, LocalDate end, CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(start);
        cycle.setPeriodEnd(end);
        cycle.setStatus(status);
        return cycleRepository.save(cycle);
    }

    @Test
    void findAllByOrderByPeriodStartDescReturnsMostRecentCycleFirst() {
        Cycle older = newCycle(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 15), CycleStatus.CLOSED);
        Cycle newer = newCycle(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15), CycleStatus.OPEN);

        Page<Cycle> result = cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Cycle::getId).containsExactly(newer.getId(), older.getId());
        assertThat(result.getTotalElements()).isEqualTo(2);
    }

    @Test
    void findByStatusOrderByPeriodStartDescNarrowsToMatchingStatusOnly() {
        newCycle(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 15), CycleStatus.CLOSED);
        Cycle open = newCycle(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15), CycleStatus.OPEN);

        Page<Cycle> result = cycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus.OPEN, PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Cycle::getId).containsExactly(open.getId());
        assertThat(result.getTotalElements()).isEqualTo(1);
    }
}
