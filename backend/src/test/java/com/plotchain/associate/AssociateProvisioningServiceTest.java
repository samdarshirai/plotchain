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

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    AssociateProvisioningService service;

    private final RankTier lowestRank =
        new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    @BeforeEach
    void setUp() {
        service = new AssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder, "VP");
        // Default stub for the ID-generation lookup: empty repository unless a test overrides it.
        org.mockito.Mockito.lenient()
            .when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP"))
            .thenReturn(Optional.empty());
        org.mockito.Mockito.lenient().when(associateRepository.existsByUserId(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(false);
    }

    @Test
    void createsAnAssociateWithATemporaryPasswordThatMustBeChanged() {
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));

        CreateAssociateResponse response = service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, null, null));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository).save(saved.capture());
        Associate created = saved.getValue();

        assertThat(created.getEmail()).isEqualTo("new@plotchain.test");
        assertThat(created.getName()).isEqualTo("Jane Doe");
        assertThat(created.getRole()).isEqualTo(AssociateRole.ASSOCIATE);
        assertThat(created.getRankId()).isEqualTo(lowestRank.getId());
        assertThat(created.getKycStatus()).isEqualTo(KycStatus.PENDING);
        assertThat(created.isMustChangePassword()).isTrue();
        assertThat(created.getUserId()).isEqualTo("VP00001");

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(response.associateId()).isEqualTo(created.getId());
        // The response carries the plaintext once; only the hash is persisted.
        assertThat(created.getPasswordHash()).isNotEqualTo(response.temporaryPassword());
        assertThat(passwordEncoder.matches(response.temporaryPassword(), created.getPasswordHash())).isTrue();
    }

    @Test
    void generatesTheNextIdGivenAnExistingMaximum() {
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
        Associate existing = new Associate();
        existing.setUserId("VP00007");
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP"))
            .thenReturn(Optional.of(existing));

        CreateAssociateResponse response = service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, null, null));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo("VP00008");
    }

    @Test
    void honoursAConfiguredPrefix() {
        AssociateProvisioningService prefixedService =
            new AssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder, "RS");
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(lowestRank));
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("RS")).thenReturn(Optional.empty());
        when(associateRepository.existsByUserId(org.mockito.ArgumentMatchers.anyString())).thenReturn(false);

        CreateAssociateResponse ignored = prefixedService.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, null, null));

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        org.mockito.Mockito.verify(associateRepository).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo("RS00001");
    }

    @Test
    void rejectsADuplicateEmail() {
        when(associateRepository.existsByEmail("taken@plotchain.test")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "taken@plotchain.test", null, null, null)))
            .isInstanceOf(EmailAlreadyRegisteredException.class);
    }

    @Test
    void rejectsAPlacementThatIsAlreadyOccupied() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(new Associate()));
        when(associateRepository.existsByParentIdAndPosition(parentId, "L")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, parentId, "L")))
            .isInstanceOf(PlacementUnavailableException.class);
    }

    @Test
    void rejectsAnUnknownParent() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(associateRepository.findById(parentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, parentId, "L")))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void failsClearlyWhenNoRankTiersAreConfigured() {
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, null, null)))
            .isInstanceOf(NoRankTiersConfiguredException.class);
    }
}
