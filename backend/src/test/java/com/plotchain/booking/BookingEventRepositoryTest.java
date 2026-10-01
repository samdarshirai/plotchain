package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class BookingEventRepositoryTest {

    @Autowired BookingEventRepository bookingEventRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    private UUID persistProject() {
        Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
        return entityManager.persist(project).getId();
    }

    private UUID persistPlot(UUID projectId) {
        Plot plot = new Plot(UUID.randomUUID(), projectId, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.BOOKED);
        return entityManager.persist(plot).getId();
    }

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        // ADMIN: chk_associate_rank_required (V4) demands a rank_id for ASSOCIATE rows.
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private PlotBooking persistBooking() {
        UUID plotId = persistPlot(persistProject());
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(plotId);
        b.setAssociateId(persistAssociate());
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal("600000.00"));
        b.setInstallmentCount(1);
        b.setBookedAt(Instant.now());
        return plotBookingRepository.saveAndFlush(b);
    }

    @Test
    void savesAPaidEventAndReadsItBackOldestFirst() {
        PlotBooking b = persistBooking();
        Instant t0 = Instant.parse("2026-06-15T10:00:00Z");
        bookingEventRepository.saveAndFlush(
            BookingEvent.of(b.getId(), BookingEventType.PAID, b.getAssociateId(), "installment 1", t0));
        bookingEventRepository.saveAndFlush(
            BookingEvent.of(b.getId(), BookingEventType.PAID, b.getAssociateId(), null, t0.plusSeconds(60)));

        List<BookingEvent> events = bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId());

        assertThat(events).hasSize(2);
        assertThat(events.get(0).getDetail()).isEqualTo("installment 1");
        assertThat(events.get(0).getType()).isEqualTo(BookingEventType.PAID);
        // DB-level: the enum is stored as the plain string the V41 CHECK constraint expects.
        assertThat(jdbc.queryForObject(
            "SELECT type FROM booking_event WHERE id = ?", String.class, events.get(0).getId()))
            .isEqualTo("PAID");
    }
}
