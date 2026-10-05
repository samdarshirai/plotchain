package com.plotchain.projects;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.booking.BookingResponse;
import com.plotchain.booking.BookingService;
import com.plotchain.booking.CancelBookingRequest;
import com.plotchain.booking.CreateBookingRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 via Flyway) proof for plot-booking unit 10: the grid shows the live plot status as bookings
// move it AVAILABLE -> BOOKED -> AVAILABLE (cancel) and as a plot is SOLD (direct update, as confirm does).
@SpringBootTest
@ActiveProfiles("test")
class PlotGridLiveStatusIntegrationTest {

    @Autowired PlotGridService plotGridService;
    @Autowired BookingService bookingService;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired JdbcTemplate jdbc;

    private UUID projectId;
    private UUID plotId;
    private UUID associateId;
    private Map<String, Object> originalConfig;

    @BeforeEach
    void seed() {
        originalConfig = jdbc.queryForMap(
            "SELECT emi_enabled, default_installment_count, confirm_rule, confirm_threshold_percent FROM booking_emi_config");
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = TRUE, default_installment_count = 4, "
            + "confirm_rule = 'MANUAL', confirm_threshold_percent = NULL, updated_at = CURRENT_TIMESTAMP");

        Project project = new Project(UUID.randomUUID(), "Grid Test Project", "Hyderabad", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();
        plotId = UUID.randomUUID();
        // two plots so ordering over the real column is exercised too: "10" inserted before "2"
        plotRepository.saveAndFlush(new Plot(UUID.randomUUID(), projectId, "10", PlotType.NORMAL,
            new BigDecimal("900.00"), new BigDecimal("400.00"), new BigDecimal("360000.00"), PlotStatus.AVAILABLE));
        plotRepository.saveAndFlush(new Plot(plotId, projectId, "2", PlotType.CORNER,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.AVAILABLE));

        associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setPosition("L");
        associate.setName("Grid Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + associateId);
        associate.setEmail(associateId + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        // ADMIN: chk_associate_rank_required demands a rank for ASSOCIATE rows; also the FK-satisfying actor.
        associate.setRole(AssociateRole.ADMIN);
        associateRepository.saveAndFlush(associate);
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = ?, default_installment_count = ?, "
                + "confirm_rule = ?, confirm_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP",
            originalConfig.get("EMI_ENABLED"), originalConfig.get("DEFAULT_INSTALLMENT_COUNT"),
            originalConfig.get("CONFIRM_RULE"), originalConfig.get("CONFIRM_THRESHOLD_PERCENT"));
        jdbc.update("DELETE FROM booking_event WHERE booking_id IN (SELECT id FROM plot_booking WHERE associate_id = ?)", associateId);
        jdbc.update("DELETE FROM emi_installment WHERE booking_id IN (SELECT id FROM plot_booking WHERE associate_id = ?)", associateId);
        jdbc.update("DELETE FROM plot_booking WHERE associate_id = ?", associateId);
        jdbc.update("DELETE FROM plot WHERE project_id = ?", projectId);
        jdbc.update("DELETE FROM project WHERE id = ?", projectId);
        jdbc.update("DELETE FROM associate WHERE id = ?", associateId);
    }

    private PlotStatus gridStatusOfPlot2() {
        return plotGridService.grid(projectId).stream()
            .filter(r -> r.plotId().equals(plotId)).findFirst().orElseThrow().status();
    }

    @Test
    void gridReturnsRealRowsInNaturalOrderWithTheSixFields() {
        var rows = plotGridService.grid(projectId);

        assertThat(rows).extracting(PlotGridResponse::plotNo).containsExactly("2", "10");
        PlotGridResponse two = rows.get(0);
        assertThat(two.plotId()).isEqualTo(plotId);
        assertThat(two.type()).isEqualTo(PlotType.CORNER);
        assertThat(two.area()).isEqualByComparingTo("1200.00");
        assertThat(two.price()).isEqualByComparingTo("600000.00");
        assertThat(two.status()).isEqualTo(PlotStatus.AVAILABLE);
    }

    @Test
    void statusFollowsBookingCreateCancelAndSold() {
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.AVAILABLE);

        BookingResponse booking = bookingService.createBooking(
            new CreateBookingRequest(plotId, associateId, "Jane Buyer", null, new java.math.BigDecimal("1000")));
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.BOOKED);

        bookingService.cancelBooking(booking.id(), new CancelBookingRequest("buyer withdrew"), associateId);
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.AVAILABLE);

        // confirm / recordSale flip the plot to SOLD; a direct update is the same state the grid must show
        jdbc.update("UPDATE plot SET status = 'SOLD' WHERE id = ?", plotId);
        assertThat(gridStatusOfPlot2()).isEqualTo(PlotStatus.SOLD);
    }
}
