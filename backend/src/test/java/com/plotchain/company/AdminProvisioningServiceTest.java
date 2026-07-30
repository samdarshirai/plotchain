package com.plotchain.company;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminProvisioningServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock PasswordEncoder passwordEncoder;

    AdminProvisioningService service;

    @BeforeEach
    void setUp() {
        service = new AdminProvisioningService(associateRepository, passwordEncoder);
    }

    private Associate adminFamilyRow(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        return associate;
    }

    @Test
    void createWithExplicitTemporaryPasswordPersistsCorrectly() {
        when(associateRepository.existsByUserId("finance1")).thenReturn(false);
        when(passwordEncoder.encode("Sup3rSecret!")).thenReturn("hashed-secret");

        CreateAdminResponse response = service.create(
            new CreateAdminRequest("finance1", "Jane Finance", "FINANCE", "Sup3rSecret!"));

        ArgumentCaptor<Associate> captor = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(captor.capture());
        Associate created = captor.getValue();

        assertThat(created.getUserId()).isEqualTo("finance1");
        assertThat(created.getName()).isEqualTo("Jane Finance");
        assertThat(created.getRole()).isEqualTo(AssociateRole.FINANCE);
        assertThat(created.getRankId()).isNull();
        assertThat(created.getKycStatus()).isEqualTo(KycStatus.VERIFIED);
        assertThat(created.isMustChangePassword()).isTrue();
        assertThat(created.getPasswordHash()).isEqualTo("hashed-secret");
        assertThat(created.getJoinedAt()).isNotNull();
        assertThat(created.getCumulativeMatchedVolume()).isEqualByComparingTo("0");

        assertThat(response.id()).isEqualTo(created.getId());
        assertThat(response.userId()).isEqualTo("finance1");
        assertThat(response.role()).isEqualTo("FINANCE");
        assertThat(response.temporaryPassword()).isEqualTo("Sup3rSecret!");
    }

    @Test
    void createWithBlankTemporaryPasswordGeneratesAndReturnsOne() {
        when(associateRepository.existsByUserId("support1")).thenReturn(false);
        when(passwordEncoder.encode(anyString())).thenReturn("hashed-generated");

        CreateAdminResponse response = service.create(
            new CreateAdminRequest("support1", "Sam Support", "SUPPORT", "  "));

        ArgumentCaptor<Associate> captor = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(captor.capture());

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(captor.getValue().getPasswordHash()).isEqualTo("hashed-generated");
        verify(passwordEncoder).encode(response.temporaryPassword());
    }

    @Test
    void rejectsAssociateAsATargetRole() {
        assertThatThrownBy(() -> service.create(
            new CreateAdminRequest("user1", "Someone", "ASSOCIATE", "pw")))
            .isInstanceOf(InvalidAdminRoleException.class);
    }

    @Test
    void rejectsAdminAsATargetRole() {
        assertThatThrownBy(() -> service.create(
            new CreateAdminRequest("user1", "Someone", "ADMIN", "pw")))
            .isInstanceOf(InvalidAdminRoleException.class);
    }

    @Test
    void rejectsADuplicateUserId() {
        when(associateRepository.existsByUserId("taken")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
            new CreateAdminRequest("taken", "Someone", "SUPPORT", "pw")))
            .isInstanceOf(UserIdAlreadyRegisteredException.class);
    }

    @Test
    void isCompleteIsFalseWithOnlyTheFoundingAdmin() {
        when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(1L);

        assertThat(service.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWithTwoOrMoreAdminFamilyRows() {
        when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(2L);

        assertThat(service.isComplete()).isTrue();
    }

    @Test
    void listExcludesAssociateRows() {
        Associate finance = adminFamilyRow(AssociateRole.FINANCE);
        finance.setUserId("finance1");
        finance.setName("Jane Finance");
        finance.setLastActiveAt(Instant.now());
        when(associateRepository.findByRoleNotOrderByUserIdAsc(AssociateRole.ASSOCIATE)).thenReturn(List.of(finance));

        List<AdminSummaryResponse> summaries = service.list();

        assertThat(summaries).hasSize(1);
        AdminSummaryResponse summary = summaries.get(0);
        assertThat(summary.id()).isEqualTo(finance.getId());
        assertThat(summary.userId()).isEqualTo("finance1");
        assertThat(summary.fullName()).isEqualTo("Jane Finance");
        assertThat(summary.role()).isEqualTo("FINANCE");
        assertThat(summary.lastActiveAt()).isEqualTo(finance.getLastActiveAt());
    }

    @Test
    void isUserIdAvailableIsTrueWhenNotTaken() {
        when(associateRepository.existsByUserId("fresh")).thenReturn(false);

        assertThat(service.isUserIdAvailable("fresh")).isTrue();
    }

    @Test
    void isUserIdAvailableIsFalseWhenTaken() {
        when(associateRepository.existsByUserId("taken")).thenReturn(true);

        assertThat(service.isUserIdAvailable("taken")).isFalse();
    }
}
