package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNomineeRepository;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Real H2 + Flyway: proves the Join create-and-activate transaction end to end.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class EPinJoinIntegrationTest {

    @Autowired EPinService epinService;
    @Autowired EPinRepository epinRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired AssociateNomineeRepository nomineeRepository;
    @Autowired RankTierRepository rankTierRepository;

    UUID rankId;

    @BeforeEach
    void rank() {
        rankId = rankTierRepository.findAllByOrderByRankOrder().stream().findFirst().map(RankTier::getId).orElseThrow();
    }

    private Associate member(String userId, UUID parent, String pos) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setUserId(userId);
        a.setName("N " + userId);
        a.setEmail(userId + "@t.local");
        a.setPasswordHash("x");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setRankId(rankId);
        a.setParentId(parent);
        a.setPosition(pos);
        return associateRepository.saveAndFlush(a);
    }

    private EPin pin(UUID holder, EPinType type) {
        EPin e = new EPin();
        e.setId(UUID.randomUUID());
        e.setCode("C" + UUID.randomUUID().toString().substring(0, 8));
        e.setBatchId(UUID.randomUUID());
        e.setStatus(EPinStatus.ALLOCATED);
        e.setAllocatedTo(holder);
        e.setGeneratedBy(holder);
        e.setGeneratedAt(Instant.now());
        e.setPinType(type);
        return epinRepository.saveAndFlush(e);
    }

    private JoinEPinRequest req(String sponsor, String pos, String pan, String aadhaar) {
        return new JoinEPinRequest("New Person", sponsor, pos, null, pan, aadhaar, null, null, null,
            null, "9876543210", "Delhi", "Central", "Addr", null, "Nom", "Son", "pw");
    }

    @Test
    void joinCreatesActiveMemberOnTheSponsorsLegAndSpendsThePin() {
        Associate me = member("JN1", null, null);
        Associate legChild = member("JN2", me.getId(), "L");
        EPin pin = pin(me.getId(), EPinType.REGISTRATION);

        JoinEPinResponse res = epinService.join(pin.getId(), req("JN1", "L", "ABCDE1234F", "123456789012"), me.getId());

        Associate created = associateRepository.findByUserId(res.userId()).orElseThrow();
        assertThat(created.getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        assertThat(created.getParentId()).isEqualTo(legChild.getId()); // first free slot down the left leg
        assertThat(created.getPosition()).isEqualTo("L");
        assertThat(created.getSponsorId()).isEqualTo(me.getId());
        assertThat(created.getPanNumber()).isEqualTo("ABCDE1234F");
        assertThat(res.temporaryPassword()).isNotBlank();
        assertThat(res.transactionPassword()).isNotBlank();
        assertThat(created.getTransactionPasswordHash()).isNotBlank().isNotEqualTo(res.transactionPassword());
        assertThat(nomineeRepository.findByAssociateId(created.getId())).isPresent();
        EPin spent = epinRepository.findById(pin.getId()).orElseThrow();
        assertThat(spent.getStatus()).isEqualTo(EPinStatus.USED);
        assertThat(spent.getRedeemedTo()).isEqualTo(created.getId());
    }

    @Test
    void sponsorOutsideMyDownlineIsNotFound() {
        Associate me = member("JN3", null, null);
        member("JN4", null, null);
        EPin pin = pin(me.getId(), EPinType.REGISTRATION);
        assertThatThrownBy(() -> epinService.join(pin.getId(), req("JN4", "L", "ABCDE1234F", "123456789012"), me.getId()))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void topupPinCannotRegisterAMember() {
        Associate me = member("JN5", null, null);
        EPin pin = pin(me.getId(), EPinType.TOPUP);
        assertThatThrownBy(() -> epinService.join(pin.getId(), req("JN5", "L", "ABCDE1234F", "123456789012"), me.getId()))
            .isInstanceOf(EPinInvalidStateException.class);
    }

    @Test
    void duplicatePanOrAadhaarIsRejected() {
        Associate me = member("JN6", null, null);
        pin(me.getId(), EPinType.REGISTRATION);
        EPin p1 = pin(me.getId(), EPinType.REGISTRATION);
        epinService.join(p1.getId(), req("JN6", "L", "ABCDE1234F", "123456789012"), me.getId());
        EPin p2 = pin(me.getId(), EPinType.REGISTRATION);
        assertThatThrownBy(() -> epinService.join(p2.getId(), req("JN6", "R", "ABCDE1234F", "999999999999"), me.getId()))
            .isInstanceOf(EPinDuplicateIdentityException.class).hasMessage("PAN_TAKEN");
        assertThatThrownBy(() -> epinService.join(p2.getId(), req("JN6", "R", "ZZZZZ9999Z", "123456789012"), me.getId()))
            .isInstanceOf(EPinDuplicateIdentityException.class).hasMessage("AADHAAR_TAKEN");
        assertThat(epinRepository.findById(p2.getId()).orElseThrow().getStatus()).isEqualTo(EPinStatus.ALLOCATED);
    }
}
