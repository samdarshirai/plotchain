package com.plotchain.company;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateIdGenerator;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.associate.NoRankTiersConfiguredException;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RootAssociateProvisioningServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    RootAssociateProvisioningService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    private final RankTier lowestRank =
        new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        // AssociateIdGenerator is a concrete class -- this JDK's Mockito/ByteBuddy can't
        // instrument it, so it's constructed for real here, backed by the mocked repository,
        // same pattern AssociateProvisioningServiceTest uses.
        AssociateIdGenerator associateIdGenerator = new AssociateIdGenerator(associateRepository, "VP");
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new RootAssociateProvisioningService(
            associateRepository, rankTierRepository, passwordEncoder, associateIdGenerator, settingsAuditService);
        Mockito.lenient()
            .when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP"))
            .thenReturn(Optional.empty());
        Mockito.lenient().when(associateRepository.existsByUserId(ArgumentMatchers.anyString())).thenReturn(false);
        Mockito.lenient()
            .when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of());
        Mockito.lenient().when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
    }

    @Test
    void createsALeftRootWithNoParentSponsorOrPosition() {
        CreateRootAssociateResponse response = service.create(
            new CreateRootAssociateRequest("Root One", "9990001111", false, null, null), ACTOR_ID);

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        Mockito.verify(associateRepository).save(saved.capture());
        Associate created = saved.getValue();

        assertThat(created.getName()).isEqualTo("Root One");
        assertThat(created.getPhone()).isEqualTo("9990001111");
        assertThat(created.getParentId()).isNull();
        assertThat(created.getSponsorId()).isNull();
        assertThat(created.getPosition()).isNull();
        assertThat(created.getRole()).isEqualTo(AssociateRole.ASSOCIATE);
        assertThat(created.getRankId()).isEqualTo(lowestRank.getId());
        assertThat(created.getKycStatus()).isEqualTo(KycStatus.PENDING);
        assertThat(created.isMustChangePassword()).isTrue();

        assertThat(response.left().name()).isEqualTo("Root One");
        assertThat(response.left().slotLabel()).isEqualTo("LEFT");
        assertThat(response.left().temporaryPassword()).isNotBlank();
        assertThat(response.right()).isNull();
    }

    @Test
    void createsBothRootsWhenSeedRightRootIsTrue() {
        Associate leftSaved = new Associate();
        leftSaved.setUserId("VP00001");
        Mockito.lenient()
            .when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP"))
            .thenReturn(Optional.empty(), Optional.of(leftSaved));

        CreateRootAssociateResponse response = service.create(
            new CreateRootAssociateRequest("Root Left", "9990001111", true, "Root Right", "9990002222"), ACTOR_ID);

        Mockito.verify(associateRepository, Mockito.times(2)).save(Mockito.any(Associate.class));

        assertThat(response.left().slotLabel()).isEqualTo("LEFT");
        assertThat(response.left().name()).isEqualTo("Root Left");
        assertThat(response.right()).isNotNull();
        assertThat(response.right().slotLabel()).isEqualTo("RIGHT");
        assertThat(response.right().name()).isEqualTo("Root Right");
        assertThat(response.right().userId()).isEqualTo("VP00002");
    }

    @Test
    void rejectsCreationWhenARootAlreadyExists() {
        Associate existingRoot = new Associate();
        existingRoot.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(existingRoot));

        assertThatThrownBy(() -> service.create(
            new CreateRootAssociateRequest("Root Two", "9990001111", false, null, null), ACTOR_ID))
            .isInstanceOf(RootAssociateAlreadyExistsException.class);

        Mockito.verify(associateRepository, Mockito.never()).save(Mockito.any());
    }

    @Test
    void rejectsSeedingARightRootWithoutItsNameAndPhone() {
        assertThatThrownBy(() -> service.create(
            new CreateRootAssociateRequest("Root Left", "9990001111", true, "", null), ACTOR_ID))
            .isInstanceOf(RightRootDetailsRequiredException.class);

        Mockito.verify(associateRepository, Mockito.never()).save(Mockito.any());
    }

    @Test
    void failsClearlyWhenNoRankTiersAreConfigured() {
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        assertThatThrownBy(() -> service.create(
            new CreateRootAssociateRequest("Root One", "9990001111", false, null, null), ACTOR_ID))
            .isInstanceOf(NoRankTiersConfiguredException.class);
    }

    @Test
    void createRecordsAnAuditEntryForLeftRootOnly() {
        CreateRootAssociateResponse response = service.create(
            new CreateRootAssociateRequest("Root One", "9990001111", false, null, null), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("ROOT_ASSOCIATES");
        assertThat(saved.getSummary()).isEqualTo("Seeded root associate(s)");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail())
            .contains("\"left\":{")
            .contains("\"name\":\"Root One\"")
            .contains("\"slotLabel\":\"LEFT\"")
            .contains("\"right\":null");
        // Adversarial check: the left root's one-time plaintext temporary password must never
        // appear anywhere in the persisted audit detail.
        assertThat(saved.getDetail()).doesNotContain(response.left().temporaryPassword());
    }

    @Test
    void createRecordsAnAuditEntryForBothRootsWhenRightRootIsSeeded() {
        Associate leftSaved = new Associate();
        leftSaved.setUserId("VP00001");
        Mockito.lenient()
            .when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP"))
            .thenReturn(Optional.empty(), Optional.of(leftSaved));

        CreateRootAssociateResponse response = service.create(
            new CreateRootAssociateRequest("Root Left", "9990001111", true, "Root Right", "9990002222"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("ROOT_ASSOCIATES");
        assertThat(saved.getSummary()).isEqualTo("Seeded root associate(s)");
        assertThat(saved.getDetail())
            .contains("\"left\":{")
            .contains("\"name\":\"Root Left\"")
            .contains("\"slotLabel\":\"LEFT\"")
            .contains("\"right\":{")
            .contains("\"name\":\"Root Right\"")
            .contains("\"slotLabel\":\"RIGHT\"");
        // Adversarial check: neither root's one-time plaintext temporary password may appear
        // anywhere in the persisted audit detail.
        assertThat(saved.getDetail())
            .doesNotContain(response.left().temporaryPassword())
            .doesNotContain(response.right().temporaryPassword());
    }

    @Test
    void isCompleteIsFalseWithNoRootsAndTrueWithOne() {
        assertThat(service.isComplete()).isFalse();

        Associate root = new Associate();
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(root));

        assertThat(service.isComplete()).isTrue();
    }

    @Test
    void listReportsOccupancyAtZeroOneAndTwoRoots() {
        RootAssociateSlotsResponse zero = service.list();
        assertThat(zero.leftOccupied()).isFalse();
        assertThat(zero.rightOccupied()).isFalse();
        assertThat(zero.roots()).isEmpty();

        Associate left = new Associate();
        left.setUserId("VP00001");
        left.setName("Root Left");
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(left));
        RootAssociateSlotsResponse one = service.list();
        assertThat(one.leftOccupied()).isTrue();
        assertThat(one.rightOccupied()).isFalse();
        assertThat(one.roots()).hasSize(1);
        assertThat(one.roots().get(0).slotLabel()).isEqualTo("LEFT");

        Associate right = new Associate();
        right.setUserId("VP00002");
        right.setName("Root Right");
        when(associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole.ASSOCIATE))
            .thenReturn(List.of(left, right));
        RootAssociateSlotsResponse two = service.list();
        assertThat(two.leftOccupied()).isTrue();
        assertThat(two.rightOccupied()).isTrue();
        assertThat(two.roots()).hasSize(2);
        assertThat(two.roots().get(1).slotLabel()).isEqualTo("RIGHT");
    }
}
