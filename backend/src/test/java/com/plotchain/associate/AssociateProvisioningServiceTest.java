package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateProvisioningServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock AssociateNomineeRepository nomineeRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    AssociateProvisioningService service;

    private final RankTier lowestRank =
        new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        // AssociateIdGenerator is a concrete class -- this JDK's Mockito/ByteBuddy can't
        // instrument it (see AssociateIdGeneratorTest for its own dedicated coverage), so it's
        // constructed for real here, backed by the mocked repository, same as every other
        // service-layer collaborator in this codebase.
        AssociateIdGenerator associateIdGenerator = new AssociateIdGenerator(associateRepository, "VP");
        service = new AssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder, associateIdGenerator, nomineeRepository);
        org.mockito.Mockito.lenient().when(associateRepository.existsByUserId(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(false);
    }

    @Test
    void createsAnAssociateWithATemporaryPasswordThatMustBeChanged() {
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));

        CreateAssociateResponse response = service.create(
            req(null, null, "9990001111"));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        Associate created = saved.getValue();

        assertThat(created.getEmail()).isEqualTo("new@plotchain.test");
        assertThat(created.getName()).isEqualTo("Jane Doe");
        assertThat(created.getRole()).isEqualTo(AssociateRole.ASSOCIATE);
        assertThat(created.getStatus()).isEqualTo(AssociateStatus.PENDING);
        assertThat(created.getRankId()).isEqualTo(lowestRank.getId());
        assertThat(created.getKycStatus()).isEqualTo(KycStatus.PENDING);
        assertThat(created.isMustChangePassword()).isTrue();
        assertThat(created.getUserId()).matches("VP\\d{4}");
        assertThat(created.getRankChangedAt()).isNull();

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(response.associateId()).isEqualTo(created.getId());
        assertThat(response.userId()).isEqualTo(created.getUserId());
        // The response carries the plaintext once; only the hash is persisted.
        assertThat(created.getPasswordHash()).isNotEqualTo(response.temporaryPassword());
        assertThat(passwordEncoder.matches(response.temporaryPassword(), created.getPasswordHash())).isTrue();
        assertThat(response.transactionPassword()).isNotBlank();
        assertThat(passwordEncoder.matches(response.transactionPassword(), created.getTransactionPasswordHash())).isTrue();
    }

    @Test
    void rejectsAPlacementThatIsAlreadyOccupied() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(new Associate()));
        when(associateRepository.existsByParentIdAndPosition(parentId, "L")).thenReturn(true);

        assertThatThrownBy(() -> service.createPending("Jane Doe", "new@plotchain.test", null, null, parentId, "L"))
            .isInstanceOf(PlacementUnavailableException.class);
    }

    @Test
    void rejectsAnUnknownParent() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.findById(parentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createPending("Jane Doe", "new@plotchain.test", null, null, parentId, "L"))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void rejectsMissingPositionWhenAParentIsSpecified() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(new Associate()));

        assertThatThrownBy(() -> service.createPending("Jane Doe", "new@plotchain.test", null, null, parentId, null))
            .isInstanceOf(PositionRequiredException.class);
    }

    @Test
    void failsClearlyWhenNoRankTiersAreConfigured() {
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        assertThatThrownBy(() -> service.create(
            req(null, null, "9990001111")))
            .isInstanceOf(NoRankTiersConfiguredException.class);
    }

    @Test
    void persistsPhoneFromRequest() {
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));

        service.create(
            req(null, null, "+1234567890"));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        Associate created = saved.getValue();

        assertThat(created.getPhone()).isEqualTo("+1234567890");
    }

    private static CreateAssociateRequest req(String sponsorUserId, String position, String phone) {
        return new CreateAssociateRequest("Jane Doe", sponsorUserId, position, null, "ABCDE1234F", "123456789012",
            null, null, null, "new@plotchain.test", phone, "Odisha", "Khordha", "1 Main St", null, null, null);
    }

    @Test
    void createWithSponsorWalksTheLegToTheFirstFreeSlotAndStoresProfile() {
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
        Associate sponsor = new Associate();
        sponsor.setId(UUID.randomUUID());
        Associate leftChild = new Associate();
        leftChild.setId(UUID.randomUUID());
        when(associateRepository.findByUserId("VP00009")).thenReturn(Optional.of(sponsor));
        when(associateRepository.findFirstByParentIdAndPosition(sponsor.getId(), "L")).thenReturn(Optional.of(leftChild));
        when(associateRepository.findFirstByParentIdAndPosition(leftChild.getId(), "L")).thenReturn(Optional.empty());
        when(associateRepository.findById(leftChild.getId())).thenReturn(Optional.of(leftChild));

        service.create(req("VP00009", "L", "9990001111"));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository, org.mockito.Mockito.times(2)).save(saved.capture());
        Associate created = saved.getValue();
        assertThat(created.getSponsorId()).isEqualTo(sponsor.getId());
        assertThat(created.getParentId()).isEqualTo(leftChild.getId());
        assertThat(created.getPosition()).isEqualTo("L");
        assertThat(created.getPanNumber()).isEqualTo("ABCDE1234F");
        assertThat(created.getStatus()).isEqualTo(AssociateStatus.PENDING);
    }

    @Test
    void rejectsADuplicatePan() {
        when(associateRepository.existsByPanNumber("ABCDE1234F")).thenReturn(true);

        assertThatThrownBy(() -> service.create(req(null, null, "9990001111")))
            .isInstanceOf(com.plotchain.epin.EPinDuplicateIdentityException.class)
            .hasMessage("PAN_TAKEN");
    }
}
