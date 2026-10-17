package com.plotchain.adminuser;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.AssociateStatusCache;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {

    @Mock AssociateRepository repository;
    @Mock SettingsAuditLogRepository auditLogRepository;
    @Mock AssociateStatusCache statusCache;

    AdminUserService service;
    static final UUID ACTOR = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService audit = new SettingsAuditService(auditLogRepository, repository, new ObjectMapper().findAndRegisterModules());
        service = new AdminUserService(repository, new BCryptPasswordEncoder(), audit, statusCache);
    }

    private static AdminUserRequest request(String userId) {
        return new AdminUserRequest(userId, "Op One", "9999999999", "op@example.com", null);
    }

    private static Associate admin(UUID id) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId("ops1");
        a.setRole(AssociateRole.ADMIN);
        a.setStatus(AssociateStatus.ACTIVE);
        return a;
    }

    @Test
    void createStoresAdminRoleWithTemporaryPasswordThatMustBeChanged() {
        AdminUserResponse response = service.create(request("ops1"), ACTOR);

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getRole()).isEqualTo(AssociateRole.ADMIN);
        assertThat(saved.getValue().isMustChangePassword()).isTrue();
        assertThat(saved.getValue().getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(saved.getValue().getPasswordHash()).isNotEqualTo(response.temporaryPassword());
    }

    @Test
    void createRejectsDuplicateUserId() {
        when(repository.existsByUserId("ops1")).thenReturn(true);
        assertThatThrownBy(() -> service.create(request("ops1"), ACTOR)).isInstanceOf(AdminUserException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void deleteBlocksSelfAndSeedAdmin() {
        UUID id = UUID.randomUUID();
        when(repository.findByIdAndRole(id, AssociateRole.ADMIN)).thenReturn(Optional.of(admin(id)));
        assertThatThrownBy(() -> service.delete(id, id)).hasMessageContaining("own account");

        when(repository.findByIdAndRole(AdminUserService.SEED_ADMIN_ID, AssociateRole.ADMIN))
            .thenReturn(Optional.of(admin(AdminUserService.SEED_ADMIN_ID)));
        assertThatThrownBy(() -> service.delete(AdminUserService.SEED_ADMIN_ID, ACTOR)).hasMessageContaining("default admin");
        verify(repository, never()).delete(any());
    }

    @Test
    void deleteRemovesOtherAdmin() {
        UUID id = UUID.randomUUID();
        Associate a = admin(id);
        when(repository.findByIdAndRole(id, AssociateRole.ADMIN)).thenReturn(Optional.of(a));
        service.delete(id, ACTOR);
        verify(repository).delete(a);
        verify(statusCache).evict(id);
    }

    @Test
    void updateBlocksSuspendingSelf() {
        UUID id = UUID.randomUUID();
        when(repository.findByIdAndRole(id, AssociateRole.ADMIN)).thenReturn(Optional.of(admin(id)));
        AdminUserRequest suspend = new AdminUserRequest("ops1", "Op One", "9999999999", null, AssociateStatus.SUSPENDED);
        assertThatThrownBy(() -> service.update(id, suspend, id)).hasMessageContaining("suspend");
    }

    @Test
    void resetPasswordIssuesNewTemporaryPasswordAndForcesChange() {
        UUID id = UUID.randomUUID();
        Associate a = admin(id);
        a.setPasswordHash("old");
        when(repository.findByIdAndRole(id, AssociateRole.ADMIN)).thenReturn(Optional.of(a));
        AdminUserResponse response = service.resetPassword(id, ACTOR);
        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(a.getPasswordHash()).isNotEqualTo("old");
        assertThat(a.isMustChangePassword()).isTrue();
    }
}
