package com.plotchain.company;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.Map;
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
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    AdminProvisioningService service;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new AdminProvisioningService(associateRepository, passwordEncoder, settingsAuditService);
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
            new CreateAdminRequest("finance1", "Jane Finance", "FINANCE", "Sup3rSecret!"), ACTOR_ID);

        ArgumentCaptor<Associate> captor = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(captor.capture());
        Associate created = captor.getValue();

        assertThat(created.getUserId()).isEqualTo("finance1");
        assertThat(created.getName()).isEqualTo("Jane Finance");
        assertThat(created.getRole()).isEqualTo(AssociateRole.ADMIN);
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
            new CreateAdminRequest("support1", "Sam Support", "SUPPORT", "  "), ACTOR_ID);

        ArgumentCaptor<Associate> captor = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(captor.capture());

        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(captor.getValue().getPasswordHash()).isEqualTo("hashed-generated");
        verify(passwordEncoder).encode(response.temporaryPassword());
    }

    @Test
    void rejectsAssociateAsATargetRole() {
        assertThatThrownBy(() -> service.create(
            new CreateAdminRequest("user1", "Someone", "ASSOCIATE", "pw"), ACTOR_ID))
            .isInstanceOf(InvalidAdminRoleException.class);
    }

    @Test
    void rejectsAdminAsATargetRole() {
        assertThatThrownBy(() -> service.create(
            new CreateAdminRequest("user1", "Someone", "ADMIN", "pw"), ACTOR_ID))
            .isInstanceOf(InvalidAdminRoleException.class);
    }

    @Test
    void rejectsADuplicateUserId() {
        when(associateRepository.existsByUserId("taken")).thenReturn(true);

        assertThatThrownBy(() -> service.create(
            new CreateAdminRequest("taken", "Someone", "SUPPORT", "pw"), ACTOR_ID))
            .isInstanceOf(UserIdAlreadyRegisteredException.class);
    }

    @Test
    void createRecordsAnAuditEntryWithoutLeakingTheTemporaryPassword() {
        when(associateRepository.existsByUserId("finance1")).thenReturn(false);
        when(passwordEncoder.encode("Sup3rSecret!")).thenReturn("hashed-secret");

        CreateAdminResponse response = service.create(
            new CreateAdminRequest("finance1", "Jane Finance", "FINANCE", "Sup3rSecret!"), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("ADMIN_TEAM");
        assertThat(saved.getSummary()).isEqualTo("Created admin finance1 (FINANCE)");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail())
            .contains("\"userId\":\"finance1\"")
            .contains("\"fullName\":\"Jane Finance\"")
            .contains("\"role\":\"FINANCE\"");
        // Adversarial check: the one-time plaintext temporary password must never appear
        // anywhere in the persisted audit detail, in any form.
        assertThat(response.temporaryPassword()).isEqualTo("Sup3rSecret!");
        assertThat(saved.getDetail()).doesNotContain(response.temporaryPassword());
        assertThat(saved.getDetail().toString()).doesNotContain(response.temporaryPassword());
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
        Associate finance = adminFamilyRow(AssociateRole.ADMIN);
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
