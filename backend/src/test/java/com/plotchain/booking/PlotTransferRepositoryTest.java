package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB proof of the admin plot-transfers list.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PlotTransferRepositoryTest {

    static final Instant MIN = Instant.EPOCH;
    static final Instant MAX = Instant.parse("9999-01-01T00:00:00Z");

    @Autowired PlotBookingRepository bookings;
    @Autowired EmiInstallmentRepository installments;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @Autowired BookingEventRepository events;

    BookingRegisterTestData d;
    UUID projectId;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, bookings, installments).seed();
        projectId = plots.findById(d.b1.getPlotId()).orElseThrow().getProjectId();
        events.saveAndFlush(BookingEvent.plotTransfer(d.b1.getId(), d.b1.getAssociateId(), "x",
            Instant.parse("2026-06-10T10:00:00Z"), d.b2.getPlotId(), d.b1.getPlotId(),
            new BigDecimal("1000.00"), new BigDecimal("4000.00")));
        // pre-V62 style event: no snapshot, must not list
        events.saveAndFlush(BookingEvent.of(d.b1.getId(), BookingEventType.PLOT_TRANSFERRED, d.b1.getAssociateId(),
            "old", Instant.parse("2026-06-11T10:00:00Z")));
    }

    @Test
    void listsSnapshotRowsOnly() {
        var rows = events.findPlotTransfers(MIN, MAX, null, PageRequest.of(0, 50));
        assertThat(rows.getContent()).anySatisfy(r -> {
            assertThat(r.paidAmount()).isEqualByComparingTo("1000.00");
            assertThat(r.restAmount()).isEqualByComparingTo("4000.00");
        });
        assertThat(rows.getContent()).noneMatch(r -> r.paidAmount() == null);
    }

    @Test
    void dateRangeIsHalfOpenOnTo() {
        assertThat(events.findPlotTransfers(MIN, Instant.parse("2026-06-10T10:00:00Z"), projectId, PageRequest.of(0, 50))
            .getContent()).isEmpty();
        assertThat(events.findPlotTransfers(Instant.parse("2026-06-10T10:00:00Z"), MAX, projectId, PageRequest.of(0, 50))
            .getContent()).hasSize(1);
    }

    @Test
    void projectFilterExcludesOtherProjects() {
        assertThat(events.findPlotTransfers(MIN, MAX, UUID.randomUUID(), PageRequest.of(0, 50)).getContent()).isEmpty();
    }
}
