package com.plotchain.booking;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Proves V41 on rows that already exist before it runs: migrate a private H2 (PostgreSQL mode)
// DB to V40, seed bookings/installments in the V40 shape, then migrate to V41. Fails if the
// buyer_name backfill UPDATE or the status SQL DEFAULTs are removed. associate.name is NOT NULL
// since V1 (never relaxed), so the backfill needs no COALESCE.
class V41MigrationTest {

    @Test
    void v41BackfillsBuyerNameFromTheAssociateAndDefaultsStatusOnPreExistingRows() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
            "jdbc:h2:mem:v41migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("40").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);

        UUID projectId = UUID.randomUUID();
        jdbc.update("INSERT INTO project (id, name, location, created_at) VALUES (?, 'P', 'L', CURRENT_TIMESTAMP)", projectId);
        UUID plotA = seedPlot(jdbc, projectId, "A-1");
        UUID plotB = seedPlot(jdbc, projectId, "A-2");
        UUID assocA = seedAssociate(jdbc, "Alice Anand");
        UUID assocB = seedAssociate(jdbc, "Bob Bhatt");
        UUID bookingA = seedBooking(jdbc, plotA, assocA);
        UUID bookingB = seedBooking(jdbc, plotB, assocB);
        UUID installment = UUID.randomUUID();
        jdbc.update("INSERT INTO emi_installment (id, booking_id, installment_number, amount, due_date) VALUES (?, ?, 1, 100.00, DATE '2026-01-01')",
            installment, bookingA);

        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("41").load().migrate();

        assertThat(jdbc.queryForObject("SELECT buyer_name FROM plot_booking WHERE id = ?", String.class, bookingA)).isEqualTo("Alice Anand");
        assertThat(jdbc.queryForObject("SELECT buyer_name FROM plot_booking WHERE id = ?", String.class, bookingB)).isEqualTo("Bob Bhatt");
        assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, bookingA)).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE id = ?", String.class, installment)).isEqualTo("PENDING");
    }

    private UUID seedPlot(JdbcTemplate jdbc, UUID projectId, String no) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO plot (id, project_id, plot_no, plot_type, area_sqft, rate, price, status) VALUES (?, ?, ?, 'NORMAL', 1200, 500, 600000, 'BOOKED')",
            id, projectId, no);
        return id;
    }

    private UUID seedAssociate(JdbcTemplate jdbc, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO associate (id, position, name, kyc_status, joined_at, cumulative_matched_volume, user_id, email, password_hash, role) "
                + "VALUES (?, 'L', ?, 'VERIFIED', CURRENT_TIMESTAMP, 0, ?, ?, 'x', 'ADMIN')",
            id, name, "u-" + id, id + "@test.local");
        return id;
    }

    private UUID seedBooking(JdbcTemplate jdbc, UUID plotId, UUID associateId) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO plot_booking (id, plot_id, associate_id, total_amount, installment_count, booked_at) VALUES (?, ?, ?, 600000, 1, CURRENT_TIMESTAMP)",
            id, plotId, associateId);
        return id;
    }
}
