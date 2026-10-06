package com.plotchain.supportticket;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@ActiveProfiles("test")
class SupportTicketSchemaTest {

    @Autowired SupportTicketRepository supportTicketRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Admin");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private SupportTicket newTicket(UUID associateId) {
        SupportTicket t = new SupportTicket();
        t.setId(UUID.randomUUID());
        t.setAssociateId(associateId);
        t.setSubject("Cannot see my wallet");
        t.setDescription("Wallet page is blank since yesterday");
        t.setCreatedAt(Instant.now());
        t.setUpdatedAt(Instant.now());
        return t;
    }

    @Test
    void newTicketDefaultsToOpenWithNullResponse() {
        SupportTicket saved = supportTicketRepository.saveAndFlush(newTicket(persistAssociate()));
        entityManager.clear();
        SupportTicket found = supportTicketRepository.findById(saved.getId()).orElseThrow();
        assertThat(found.getStatus()).isEqualTo(SupportTicketStatus.OPEN);
        assertThat(found.getResponse()).isNull();
        assertThat(found.getRespondedAt()).isNull();
    }

    @Test
    void dbRejectsAnInvalidStatusString() {
        SupportTicket saved = supportTicketRepository.saveAndFlush(newTicket(persistAssociate()));
        assertThatThrownBy(() -> jdbc.update("UPDATE support_ticket SET status = 'BOGUS' WHERE id = ?", saved.getId()))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void dbRejectsATicketForANonexistentAssociate() {
        assertThatThrownBy(() -> supportTicketRepository.saveAndFlush(newTicket(UUID.randomUUID())))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
