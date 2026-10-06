package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of searchQueue. @DataJpaTest rolls back each test. Every assertion
// scopes to the two seeded associates (via associateId or an id filter) in case other test
// classes leave committed rows behind.
@DataJpaTest
@ActiveProfiles("test")
class SupportTicketQueueRepositoryTest {

    static final Instant T = Instant.parse("2026-06-01T00:00:00Z");

    @Autowired SupportTicketRepository repo;
    @Autowired TestEntityManager em;

    UUID a1, a2;
    SupportTicket t1, t2, t3, t4, t5, t6;

    @BeforeEach
    void seed() {
        a1 = persistAssociate();
        a2 = persistAssociate();
        t1 = ticket(a1, SupportTicketStatus.OPEN, 1);
        t2 = ticket(a1, SupportTicketStatus.IN_PROGRESS, 2);
        t3 = ticket(a2, SupportTicketStatus.OPEN, 3);
        t4 = ticket(a2, SupportTicketStatus.RESOLVED, 4);
        t5 = ticket(a1, SupportTicketStatus.CLOSED, 5);
        t6 = ticket(a1, SupportTicketStatus.CLOSED, 5);   // same createdAt as t5: tiebreak case
        em.flush();
    }

    private Page<SupportTicket> search(SupportTicketStatus status, UUID associateId, int page, int size) {
        return repo.searchQueue(status, associateId, PageRequest.of(page, size));
    }

    private static List<UUID> ids(Page<SupportTicket> p) {
        return p.getContent().stream().map(SupportTicket::getId).toList();
    }

    // t5 and t6 share createdAt, so their relative order is id DESC.
    private List<UUID> t5t6ByIdDesc() {
        return List.of(t5.getId(), t6.getId()).stream().sorted(Comparator.reverseOrder()).toList();
    }

    @Test
    void noFiltersReturnsEveryStatusNewestFirstWithIdTiebreak() {
        Page<SupportTicket> p = search(null, null, 0, 1000);
        // Other committed rows may exist; assert the relative order of ours.
        List<UUID> ours = ids(p).stream().filter(id -> List.of(t1, t2, t3, t4, t5, t6).stream()
            .anyMatch(t -> t.getId().equals(id))).toList();
        List<UUID> expected = new ArrayList<>(t5t6ByIdDesc());
        expected.addAll(List.of(t4.getId(), t3.getId(), t2.getId(), t1.getId()));
        assertThat(ours).containsExactlyElementsOf(expected);   // OPEN, IN_PROGRESS, RESOLVED, CLOSED all present
    }

    @Test
    void statusFilterAlone() {
        Page<SupportTicket> open = search(SupportTicketStatus.OPEN, a1, 0, 50);
        assertThat(ids(open)).containsExactly(t1.getId());
        assertThat(ids(search(SupportTicketStatus.OPEN, a2, 0, 50))).containsExactly(t3.getId());
        assertThat(search(SupportTicketStatus.RESOLVED, a1, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void associateFilterAlone() {
        Page<SupportTicket> p = search(null, a2, 0, 50);
        assertThat(ids(p)).containsExactly(t4.getId(), t3.getId());
        assertThat(p.getTotalElements()).isEqualTo(2);
        assertThat(search(null, a1, 0, 50).getTotalElements()).isEqualTo(4);
    }

    @Test
    void statusAndAssociateCombined() {
        assertThat(ids(search(SupportTicketStatus.CLOSED, a1, 0, 50))).containsExactlyElementsOf(t5t6ByIdDesc());
        assertThat(search(SupportTicketStatus.CLOSED, a2, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void unknownAssociateGivesAnEmptyPage() {
        Page<SupportTicket> p = search(null, UUID.randomUUID(), 0, 20);
        assertThat(p.getContent()).isEmpty();
        assertThat(p.getTotalElements()).isZero();
    }

    @Test
    void paginationKeepsTheTrueTotalAndAStableOrderAcrossPages() {
        Page<SupportTicket> first = search(null, a1, 0, 3);
        Page<SupportTicket> second = search(null, a1, 1, 3);
        Page<SupportTicket> beyond = search(null, a1, 5, 3);
        assertThat(first.getTotalElements()).isEqualTo(4);
        assertThat(ids(first)).hasSize(3);
        assertThat(ids(second)).containsExactly(t1.getId());
        assertThat(beyond.getContent()).isEmpty();
        assertThat(beyond.getTotalElements()).isEqualTo(4);
    }

    private SupportTicket ticket(UUID associateId, SupportTicketStatus status, int dayOffset) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject("Subject " + dayOffset);
        t.setDescription("Description " + dayOffset);
        t.setStatus(status);
        t.setCreatedAt(T.plusSeconds(86400L * dayOffset));
        t.setUpdatedAt(T.plusSeconds(86400L * dayOffset));
        return em.persist(t);
    }

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Queue Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);   // same trick as SupportTicketSchemaTest: ASSOCIATE rows need a rank_id
        return em.persist(associate).getId();
    }
}
