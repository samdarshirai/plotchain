package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real Flyway-migrated schema + ddl-auto: validate (application-test.yml): context start fails if
// the entity drifts from the V1 table, and the round trip proves every column is mapped.
@DataJpaTest
@ActiveProfiles("test")
class AnnouncementSchemaTest {

    @Autowired AnnouncementRepository announcementRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    @Test
    void entityRoundTripsThroughTheRealTable() {
        UUID id = UUID.randomUUID();
        Instant at = Instant.now().truncatedTo(ChronoUnit.MILLIS);
        String longBody = "b".repeat(5000); // body is TEXT, not VARCHAR(300)

        announcementRepository.saveAndFlush(new Announcement(id, "t".repeat(300), longBody, at, "ALL"));
        entityManager.clear();

        Announcement found = announcementRepository.findById(id).orElseThrow();
        assertThat(found.getTitle()).hasSize(300);
        assertThat(found.getBody()).isEqualTo(longBody);
        assertThat(found.getPublishedAt()).isEqualTo(at);
        assertThat(found.getAudience()).isEqualTo("ALL");
    }

    @Test
    void rowsInsertedWithoutAudienceGetTheColumnDefault() {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO announcement (id, title, body, published_at) VALUES (?, 't', 'b', CURRENT_TIMESTAMP)", id);
        assertThat(jdbc.queryForObject("SELECT audience FROM announcement WHERE id = ?", String.class, id)).isEqualTo("ALL");
    }
}
