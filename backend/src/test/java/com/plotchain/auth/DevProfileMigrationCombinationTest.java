package com.plotchain.auth;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Regression test for a real collision the admin-seeding migration (V18) would otherwise cause:
// V900__seed_dev_accounts.sql (loaded only under the `dev` Spring profile, local development)
// used to insert its own ADMIN row with user_id = 'admin' -- the same user_id V18 now seeds in
// every environment. Both migration locations merge into one Flyway version sequence
// (V18 < V900), so a fresh `dev`-profile bootstrap would fail applying V900 on the unique index
// idx_associate_user_id. This runs the exact combined migration set (main + dev) Flyway applies
// for a real `dev`-profile boot, against a disposable, uniquely-named H2 instance isolated from
// the shared test-suite database, so it can neither pollute nor be polluted by any other test.
class DevProfileMigrationCombinationTest {

    @Test
    void mainAndDevMigrationsApplyTogetherWithoutCollision() throws Exception {
        String dbName = "devmigrationcheck" + UUID.randomUUID().toString().replace("-", "");
        String url = "jdbc:h2:mem:" + dbName + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";

        Flyway flyway = Flyway.configure()
            .dataSource(url, "sa", "")
            .locations("classpath:db/migration", "classpath:db/migration-dev")
            .load();

        flyway.migrate();

        List<String> userIds = new ArrayList<>();
        try (Connection conn = flyway.getConfiguration().getDataSource().getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT user_id FROM associate ORDER BY user_id")) {
            while (rs.next()) {
                userIds.add(rs.getString("user_id"));
            }
        }

        assertThat(userIds).containsExactly("admin", "associate01");
    }
}
