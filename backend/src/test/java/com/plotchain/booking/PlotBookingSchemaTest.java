package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@ActiveProfiles("test")
class PlotBookingSchemaTest {

    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired com.plotchain.sales.SaleRepository saleRepository;
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

    private UUID persistCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 1, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 1, 15));
        cycle.setStatus(CycleStatus.OPEN);
        return entityManager.persist(cycle).getId();
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

    private EmiInstallment persistInstallment(UUID bookingId) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setBookingId(bookingId);
        i.setInstallmentNumber(1);
        i.setAmount(new BigDecimal("600000.00"));
        i.setDueDate(LocalDate.of(2026, 1, 1));
        return emiInstallmentRepository.saveAndFlush(i);
    }

    @Test
    void newBookingDefaultsToActiveAndNewInstallmentToPending() {
        PlotBooking b = persistBooking();
        EmiInstallment i = persistInstallment(b.getId());
        entityManager.clear();
        assertThat(plotBookingRepository.findById(b.getId()).orElseThrow().getStatus()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(emiInstallmentRepository.findById(i.getId()).orElseThrow().getStatus()).isEqualTo(InstallmentStatus.PENDING);
    }

    @Test
    void dbRejectsAnInvalidPlotBookingStatus() {
        PlotBooking b = persistBooking();
        assertThatThrownBy(() -> jdbc.update("UPDATE plot_booking SET status = 'BOGUS' WHERE id = ?", b.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void dbRejectsAnInvalidEmiInstallmentStatus() {
        EmiInstallment i = persistInstallment(persistBooking().getId());
        assertThatThrownBy(() -> jdbc.update("UPDATE emi_installment SET status = 'BOGUS' WHERE id = ?", i.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void dbRejectsAnInvalidBookingEventType() {
        PlotBooking b = persistBooking();
        assertThatThrownBy(() -> jdbc.update(
            "INSERT INTO booking_event (id, booking_id, type, actor_id, created_at) VALUES (?, ?, 'BOGUS', ?, CURRENT_TIMESTAMP)",
            UUID.randomUUID(), b.getId(), b.getAssociateId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void bookingEventAcceptsEveryValidType() {
        PlotBooking b = persistBooking();
        for (String type : List.of("PAID", "CONFIRMED", "CANCELLED", "TRANSFERRED")) {
            jdbc.update("INSERT INTO booking_event (id, booking_id, type, actor_id, detail, created_at) VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)",
                UUID.randomUUID(), b.getId(), type, b.getAssociateId());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", Integer.class, b.getId())).isEqualTo(4);
    }

    @Test
    void dbRejectsTwoSalesLinkedToTheSameBooking() {
        PlotBooking b = persistBooking();
        UUID cycleId = persistCycle();
        saleRepository.saveAndFlush(saleFor(b, cycleId));
        assertThatThrownBy(() -> saleRepository.saveAndFlush(saleFor(b, cycleId)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void manySalesWithANullBookingIdAreAllowed() {
        UUID cycleId = persistCycle();
        PlotBooking b = persistBooking();
        Sale one = saleFor(b, cycleId); one.setBookingId(null);
        Sale two = saleFor(b, cycleId); two.setBookingId(null);
        saleRepository.saveAndFlush(one);
        saleRepository.saveAndFlush(two);
    }

    private Sale saleFor(PlotBooking b, UUID cycleId) {
        Sale s = new Sale();
        s.setId(UUID.randomUUID());
        s.setPlotId(b.getPlotId());
        s.setProjectId(entityManager.find(Plot.class, b.getPlotId()).getProjectId());
        s.setAssociateId(b.getAssociateId());
        s.setBuyerName("Jane Buyer");
        s.setNote("Confirmed from booking " + b.getId());
        s.setAmount(b.getTotalAmount());
        s.setCycleId(cycleId);
        s.setLegCredited("L");
        s.setStatus(SaleStatus.RECORDED);
        s.setRecordedAt(Instant.now());
        s.setBookingId(b.getId());
        return s;
    }
}
