package com.plotchain.booking;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// V46 widens chk_booking_event_type: RESCHEDULED is rejected at V45 and accepted after migrating to V46.
class V46MigrationTest {

    @Test
    void v46AcceptsRescheduledEventType() {
        DriverManagerDataSource ds = new DriverManagerDataSource(
            "jdbc:h2:mem:v46migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("45").load().migrate();
        JdbcTemplate jdbc = new JdbcTemplate(ds);

        UUID projectId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID assocId = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        jdbc.update("INSERT INTO project (id, name, location, created_at) VALUES (?, 'P', 'L', CURRENT_TIMESTAMP)", projectId);
        jdbc.update("INSERT INTO plot (id, project_id, plot_no, plot_type, area_sqft, rate, price, status) VALUES (?, ?, 'A-1', 'NORMAL', 1200, 500, 600000, 'BOOKED')",
            plotId, projectId);
        jdbc.update("INSERT INTO associate (id, position, name, kyc_status, joined_at, cumulative_matched_volume, user_id, email, password_hash, role) "
            + "VALUES (?, 'L', 'Alice', 'VERIFIED', CURRENT_TIMESTAMP, 0, ?, ?, 'x', 'ADMIN')", assocId, "u-" + assocId, assocId + "@test.local");
        jdbc.update("INSERT INTO plot_booking (id, plot_id, associate_id, buyer_name, total_amount, installment_count, booked_at) VALUES (?, ?, ?, 'Buyer', 600000, 1, CURRENT_TIMESTAMP)",
            bookingId, plotId, assocId);
        String insert = "INSERT INTO booking_event (id, booking_id, type, actor_id, created_at) VALUES (?, ?, 'RESCHEDULED', ?, CURRENT_TIMESTAMP)";

        assertThatThrownBy(() -> jdbc.update(insert, UUID.randomUUID(), bookingId, assocId))
            .isInstanceOf(DataIntegrityViolationException.class);

        Flyway.configure().dataSource(ds).locations("classpath:db/migration").target("46").load().migrate();

        assertThat(jdbc.update(insert, UUID.randomUUID(), bookingId, assocId)).isEqualTo(1);
    }
}
