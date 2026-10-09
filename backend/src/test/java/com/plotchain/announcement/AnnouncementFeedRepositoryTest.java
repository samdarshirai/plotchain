package com.plotchain.announcement;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of the feed ordering. @DataJpaTest rolls back each test. Other test
// classes (e.g. SecurityConfigTest) may leave committed rows, so every assertion looks only at the
// rows this test created and checks their RELATIVE order.
@DataJpaTest
@ActiveProfiles("test")
class AnnouncementFeedRepositoryTest {

    @Autowired AnnouncementRepository repo;
    @Autowired TestEntityManager em;

    private Announcement row(String title, String publishedAt) {
        return em.persist(new Announcement(UUID.randomUUID(), title, "body", Instant.parse(publishedAt), "ALL"));
    }

    private static List<UUID> ours(Page<Announcement> p, Announcement... rows) {
        List<UUID> mine = List.of(rows).stream().map(Announcement::getId).toList();
        return p.getContent().stream().map(Announcement::getId).filter(mine::contains).toList();
    }

    @Test
    void newestPublishedAtComesFirst() {
        Announcement oldest = row("oldest", "2031-01-01T00:00:00Z");
        Announcement newest = row("newest", "2031-03-01T00:00:00Z");
        Announcement middle = row("middle", "2031-02-01T00:00:00Z");
        em.flush();

        Page<Announcement> p = repo.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 1000));

        assertThat(ours(p, oldest, newest, middle))
            .containsExactly(newest.getId(), middle.getId(), oldest.getId());
    }

    @Test
    void samePublishedAtFallsBackToIdDescending() {
        Announcement a = row("a", "2032-01-01T00:00:00Z");
        Announcement b = row("b", "2032-01-01T00:00:00Z");
        em.flush();

        Page<Announcement> p = repo.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 1000));

        // Compare ids as strings: the DB orders UUIDs as unsigned bytes, UUID.compareTo is signed.
        List<UUID> expected = List.of(a.getId(), b.getId()).stream()
            .sorted(Comparator.comparing(UUID::toString).reversed()).toList();
        assertThat(ours(p, a, b)).containsExactlyElementsOf(expected);
    }

    @Test
    void pagingReportsTotalAndSplitsWithoutLosingOrDuplicatingTiedRows() {
        Announcement t1 = row("t1", "2033-01-01T00:00:00Z");
        Announcement t2 = row("t2", "2033-01-01T00:00:00Z");
        Announcement t3 = row("t3", "2033-01-01T00:00:00Z");
        em.flush();
        long total = repo.count();

        Page<Announcement> first = repo.findAllByOrderByPublishedAtDesc(PageRequest.of(0, 2));
        assertThat(first.getTotalElements()).isEqualTo(total);
        assertThat(first.getContent()).hasSize(2);

        // Walk every page; each of our three tied rows must appear exactly once.
        List<UUID> seen = new ArrayList<>();
        for (int i = 0; i < first.getTotalPages(); i++) {
            repo.findAllByOrderByPublishedAtDesc(PageRequest.of(i, 2)).forEach(x -> seen.add(x.getId()));
        }
        assertThat(seen).containsOnlyOnce(t1.getId(), t2.getId(), t3.getId());
    }
}
