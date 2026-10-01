package com.plotchain.booking;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OverdueReportServiceTest {

    @Mock PlotBookingRepository repo;

    private OverdueReportService serviceAt(String instant) {
        return new OverdueReportService(repo, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }

    @Test
    void passesUtcTodayAndUnsortedPageableAndMapsThePage() {
        OverdueReportRow row = new OverdueReportRow(UUID.randomUUID(), UUID.randomUUID(), "A-1", UUID.randomUUID(),
            "Asha", "Buyer", 2, new BigDecimal("300.00"), LocalDate.of(2026, 6, 1));
        when(repo.findOverdueReport(any(), any())).thenReturn(new PageImpl<>(List.of(row), PageRequest.of(2, 10), 21));

        OverdueReportPageResponse r = serviceAt("2026-06-15T23:59:59Z").getOverdueReport(2, 10);

        ArgumentCaptor<LocalDate> today = ArgumentCaptor.forClass(LocalDate.class);
        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(repo).findOverdueReport(today.capture(), pageable.capture());
        assertThat(today.getValue()).isEqualTo(LocalDate.of(2026, 6, 15));
        assertThat(pageable.getValue()).isEqualTo(PageRequest.of(2, 10));
        assertThat(pageable.getValue().getSort().isUnsorted()).isTrue();
        assertThat(r.rows()).containsExactly(row);
        assertThat(r.page()).isEqualTo(2);
        assertThat(r.size()).isEqualTo(10);
        assertThat(r.totalElements()).isEqualTo(21);
    }

    @Test
    void clockNotSystemTimeDrivesTodayAcrossTheUtcMidnightBoundary() {
        when(repo.findOverdueReport(any(), any())).thenReturn(new PageImpl<>(List.of()));

        serviceAt("2026-06-16T00:00:00Z").getOverdueReport(0, 20);

        ArgumentCaptor<LocalDate> today = ArgumentCaptor.forClass(LocalDate.class);
        verify(repo).findOverdueReport(today.capture(), any());
        assertThat(today.getValue()).isEqualTo(LocalDate.of(2026, 6, 16));
    }
}
