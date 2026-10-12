package com.plotchain.booking;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Proves V45 on rows that already exist: migrate a private H2 (PostgreSQL mode) DB to V44, seed
// bookings/installments, then migrate to V45. Fails if the confirmed_* or price-snapshot backfills are removed.
class V45MigrationTest {

    @Test
    void v45BackfillsConfirmationAndPriceSnapshotOnPreExistingRows() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
            "jdbc:h2:mem:v45migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("44").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);

        UUID projectId = UUID.randomUUID();
        jdbc.update("INSERT INTO project (id, name, location, created_at) VALUES (?, 'P', 'L', CURRENT_TIMESTAMP)", projectId);
        UUID plotA = seedPlot(jdbc, projectId, "A-1", 1200, 500, 600000);
        UUID plotB = seedPlot(jdbc, projectId, "A-2", 900, 700, 630000);
        UUID assocA = seedAssociate(jdbc, "Alice Anand");
        UUID assocB = seedAssociate(jdbc, "Bob Bhatt");
        UUID bookingA = seedBooking(jdbc, plotA, assocA, 600000);
        UUID bookingB = seedBooking(jdbc, plotB, assocB, 630000);
        UUID paid = seedInstallment(jdbc, bookingA, 1,
            "status, paid_at, recorded_by, payment_ref", "'PAID', TIMESTAMP '2026-01-01 10:00:00', '" + assocA + "', 'TOKEN'");
        UUID pending = seedInstallment(jdbc, bookingA, 2, "status", "'PENDING'");
        UUID voided = seedInstallment(jdbc, bookingA, 3, "status", "'VOID'");

        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("45").load().migrate();

        assertThat(jdbc.queryForObject("SELECT confirmed_at FROM emi_installment WHERE id = ?", Timestamp.class, paid))
            .isEqualTo(Timestamp.valueOf("2026-01-01 10:00:00"));
        assertThat(jdbc.queryForObject("SELECT confirmed_by FROM emi_installment WHERE id = ?", UUID.class, paid)).isEqualTo(assocA);
        assertThat(jdbc.queryForObject("SELECT payment_mode FROM emi_installment WHERE id = ?", String.class, paid)).isNull();
        for (UUID id : new UUID[] {pending, voided}) {
            assertThat(jdbc.queryForObject("SELECT confirmed_at FROM emi_installment WHERE id = ?", Timestamp.class, id)).isNull();
            assertThat(jdbc.queryForObject("SELECT confirmed_by FROM emi_installment WHERE id = ?", UUID.class, id)).isNull();
        }

        assertSnapshot(jdbc, bookingA, "600000", "1200", "500");
        assertSnapshot(jdbc, bookingB, "630000", "900", "700");
        assertThat(jdbc.queryForObject("SELECT total_amount FROM plot_booking WHERE id = ?", BigDecimal.class, bookingA)).isEqualByComparingTo("600000");

        jdbc.update("INSERT INTO booking_event (id, booking_id, type, actor_id, created_at) VALUES (?, ?, 'PAY_CONFIRMED', ?, CURRENT_TIMESTAMP)",
            UUID.randomUUID(), bookingA, assocA);
    }

    private void assertSnapshot(JdbcTemplate jdbc, UUID bookingId, String listPrice, String area, String rate) {
        assertThat(jdbc.queryForObject("SELECT list_price FROM plot_booking WHERE id = ?", BigDecimal.class, bookingId)).isEqualByComparingTo(listPrice);
        assertThat(jdbc.queryForObject("SELECT discount FROM plot_booking WHERE id = ?", BigDecimal.class, bookingId)).isEqualByComparingTo("0");
        assertThat(jdbc.queryForObject("SELECT area_sqft FROM plot_booking WHERE id = ?", BigDecimal.class, bookingId)).isEqualByComparingTo(area);
        assertThat(jdbc.queryForObject("SELECT rate FROM plot_booking WHERE id = ?", BigDecimal.class, bookingId)).isEqualByComparingTo(rate);
    }

    private UUID seedPlot(JdbcTemplate jdbc, UUID projectId, String no, int area, int rate, int price) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO plot (id, project_id, plot_no, plot_type, area_sqft, rate, price, status) VALUES (?, ?, ?, 'NORMAL', ?, ?, ?, 'BOOKED')",
            id, projectId, no, area, rate, price);
        return id;
    }

    private UUID seedAssociate(JdbcTemplate jdbc, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO associate (id, position, name, kyc_status, joined_at, cumulative_matched_volume, user_id, email, password_hash, role) "
                + "VALUES (?, 'L', ?, 'VERIFIED', CURRENT_TIMESTAMP, 0, ?, ?, 'x', 'ADMIN')",
            id, name, "u-" + id, id + "@test.local");
        return id;
    }

    private UUID seedBooking(JdbcTemplate jdbc, UUID plotId, UUID associateId, int total) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO plot_booking (id, plot_id, associate_id, buyer_name, total_amount, installment_count, booked_at) VALUES (?, ?, ?, 'Buyer', ?, 1, CURRENT_TIMESTAMP)",
            id, plotId, associateId, total);
        return id;
    }

    private UUID seedInstallment(JdbcTemplate jdbc, UUID bookingId, int n, String cols, String vals) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO emi_installment (id, booking_id, installment_number, amount, due_date, " + cols + ") VALUES (?, ?, ?, 100.00, DATE '2026-01-01', " + vals + ")",
            id, bookingId, n);
        return id;
    }
}
