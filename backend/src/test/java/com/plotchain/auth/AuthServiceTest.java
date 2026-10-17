package com.plotchain.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.company.CompanyBrandingRepository;
import com.plotchain.company.CompanyBrandingService;
import com.plotchain.company.CompanyProfile;
import com.plotchain.company.CompanyProfileRepository;
import com.plotchain.company.CompanyProfileService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.company.SetupState;
import com.plotchain.company.SetupStateRepository;
import com.plotchain.company.SetupStateService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock AssociateRepository associateRepository;
    // SetupStateService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes, so a real instance is built over a mocked (interface) repository
    // instead, per the repo's established pattern.
    @Mock SetupStateRepository setupStateRepository;
    // CompanyProfileService/CompanyBrandingService are concrete classes -- mocked (interface)
    // repositories underneath, same reasoning as SetupStateService above.
    @Mock CompanyProfileRepository companyProfileRepository;
    @Mock CompanyBrandingRepository companyBrandingRepository;
    // SettingsAuditService is a concrete class -- mocked (interface) repository underneath,
    // same reasoning as CompanyProfileService/CompanyBrandingService above.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    JwtService jwtService = new JwtService("test-secret-key-at-least-32-bytes-long-for-hs256", 60);
    SetupStateService setupStateService;
    AuthService authService;
    SettingsAuditService settingsAuditService;

    @BeforeEach
    void setUp() {
        settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            // Never invoked here: these tests only exercise isLaunched(), which doesn't touch
            // compensationPlanService/paymentConfigService/payoutBankAccountService/
            // withdrawalConfigService/projectService.
            null, null, null, null, null);
        authService = new AuthService(associateRepository, passwordEncoder, jwtService, setupStateService, settingsAuditService);
    }

    private void stubLaunched(boolean launched) {
        SetupState state = new SetupState();
        if (launched) {
            state.setLaunchedAt(Instant.now());
        }
        when(setupStateRepository.findAll()).thenReturn(List.of(state));
    }

    private Associate target(AssociateRole role, AssociateStatus status) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setUserId("jane");
        a.setRole(role);
        a.setStatus(status);
        a.setMustChangePassword(true);
        return a;
    }

    @Test
    void impersonate_validAssociate_returnsTokenAndRecordsAudit() {
        Associate t = target(AssociateRole.ASSOCIATE, AssociateStatus.ACTIVE);
        UUID adminId = UUID.randomUUID();
        when(associateRepository.findById(t.getId())).thenReturn(Optional.of(t));
        stubLaunched(true);

        LoginResponse r = authService.impersonate(t.getId(), adminId);

        assertThat(r.token()).isNotBlank();
        assertThat(r.associateId()).isEqualTo(t.getId());
        assertThat(r.role()).isEqualTo("ASSOCIATE");
        assertThat(r.mustChangePassword()).isFalse();
        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
        ArgumentCaptor<com.plotchain.company.SettingsAuditLog> log =
            ArgumentCaptor.forClass(com.plotchain.company.SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(log.capture());
        assertThat(log.getValue().getSection()).isEqualTo("IMPERSONATION");
        assertThat(log.getValue().getSummary()).isEqualTo("Logged in as jane");
        assertThat(log.getValue().getChangedByAssociateId()).isEqualTo(adminId);
        assertThat(log.getValue().getDetail()).contains(t.getId().toString());
    }

    @Test
    void impersonate_adminTarget_throwsAndNoAudit() {
        Associate t = target(AssociateRole.ADMIN, AssociateStatus.ACTIVE);
        when(associateRepository.findById(t.getId())).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> authService.impersonate(t.getId(), UUID.randomUUID()))
            .isInstanceOf(ImpersonationNotAllowedException.class)
            .hasMessage("Only associate accounts can be impersonated");
        verify(settingsAuditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void impersonate_suspended_throwsAndNoAudit() {
        Associate t = target(AssociateRole.ASSOCIATE, AssociateStatus.SUSPENDED);
        when(associateRepository.findById(t.getId())).thenReturn(Optional.of(t));
        assertThatThrownBy(() -> authService.impersonate(t.getId(), UUID.randomUUID()))
            .isInstanceOf(AssociateSuspendedException.class);
        verify(settingsAuditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void impersonate_platformNotLive_throwsAndNoAudit() {
        Associate t = target(AssociateRole.ASSOCIATE, AssociateStatus.ACTIVE);
        when(associateRepository.findById(t.getId())).thenReturn(Optional.of(t));
        stubLaunched(false);
        assertThatThrownBy(() -> authService.impersonate(t.getId(), UUID.randomUUID()))
            .isInstanceOf(PlatformNotLiveException.class);
        verify(settingsAuditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void impersonate_unknownId_throwsNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> authService.impersonate(id, UUID.randomUUID()))
            .isInstanceOf(com.plotchain.associate.AssociateNotFoundException.class);
        verify(settingsAuditLogRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void issuesATokenForValidCredentials() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched(true);

        LoginResponse response = authService.login(new LoginRequest("jane", "Password123!"));

        assertThat(response.token()).isNotBlank();
        assertThat(response.associateId()).isEqualTo(associate.getId());
        assertThat(response.role()).isEqualTo("ASSOCIATE");

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(saved.capture());
        assertThat(saved.getValue().getLastActiveAt()).isNotNull();
    }

    @Test
    void rejectsAnAssociateLoginWhilePlatformIsNotLive() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched(false);

        assertThatThrownBy(() -> authService.login(new LoginRequest("jane", "Password123!")))
            .isInstanceOf(PlatformNotLiveException.class);
    }

    @Test
    void admitsAnAdminFamilyLoginRegardlessOfLaunchState() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ADMIN);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("admin")).thenReturn(Optional.of(associate));
        // Deliberately not stubbing setupStateRepository: an admin-family login short-circuits
        // past the isLaunched() check entirely, so it must never even be consulted here.

        LoginResponse response = authService.login(new LoginRequest("admin", "Password123!"));

        assertThat(response.role()).isEqualTo("ADMIN");
    }

    @Test
    void rejectsAnUnknownUserId() {
        when(associateRepository.findByUserId("nobody")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody", "whatever")))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsAWrongPassword() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.login(new LoginRequest("jane", "wrong-password")))
            .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void changesThePasswordAndClearsTheMustChangeFlag() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("OldPassword1!"));
        associate.setMustChangePassword(true);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        authService.changePassword(associateId, new ChangePasswordRequest("OldPassword1!", "NewPassword1!"));

        assertThat(passwordEncoder.matches("NewPassword1!", associate.getPasswordHash())).isTrue();
        assertThat(associate.isMustChangePassword()).isFalse();
        verify(associateRepository).save(associate);
    }

    @Test
    void rejectsAPasswordChangeWhenTheCurrentPasswordIsWrong() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("OldPassword1!"));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.changePassword(
            associateId, new ChangePasswordRequest("wrong", "NewPassword1!")))
            .isInstanceOf(InvalidCredentialsException.class);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void rejectsLoginForASuspendedAssociate() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> authService.login(new LoginRequest("jane", "Password123!")))
            .isInstanceOf(AssociateSuspendedException.class);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void admitsLoginForAnActiveAssociate() {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setPasswordHash(passwordEncoder.encode("Password123!"));
        associate.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findByUserId("jane")).thenReturn(Optional.of(associate));
        stubLaunched(true);

        LoginResponse response = authService.login(new LoginRequest("jane", "Password123!"));

        assertThat(response.token()).isNotBlank();
    }
}
