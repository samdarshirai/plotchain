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

import java.util.List;
import java.util.Optional;
import java.util.Set;
import com.plotchain.company.SettingsAuditLog;
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
        return new AdminUserRequest(userId, "Op One", "9999999999", "op@example.com", null, null);
    }

    private static Associate admin(UUID id) {
        return user(id, AssociateRole.ADMIN);
    }

    private static Associate user(UUID id, AssociateRole role) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId("ops1");
        a.setRole(role);
        a.setStatus(AssociateStatus.ACTIVE);
        return a;
    }

    @Test
    void createStoresAdminRoleWithTemporaryPasswordThatMustBeChanged() {
        AdminUserResponse response = service.create(request("ops1"), ACTOR, AssociateRole.ADMIN);

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
        assertThatThrownBy(() -> service.create(request("ops1"), ACTOR, AssociateRole.ADMIN)).isInstanceOf(AdminUserException.class);
        verify(repository, never()).save(any());
    }

    @Test
    void deleteBlocksSelfAndSeedAdmin() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(admin(id)));
        assertThatThrownBy(() -> service.delete(id, id, AssociateRole.ADMIN)).hasMessageContaining("own account");

        when(repository.findById(AdminUserService.SEED_ADMIN_ID))
            .thenReturn(Optional.of(admin(AdminUserService.SEED_ADMIN_ID)));
        assertThatThrownBy(() -> service.delete(AdminUserService.SEED_ADMIN_ID, ACTOR, AssociateRole.ADMIN)).hasMessageContaining("default admin");
        verify(repository, never()).delete(any());
    }

    @Test
    void deleteRemovesOtherAdmin() {
        UUID id = UUID.randomUUID();
        Associate a = admin(id);
        when(repository.findById(id)).thenReturn(Optional.of(a));
        service.delete(id, ACTOR, AssociateRole.ADMIN);
        verify(repository).delete(a);
        verify(statusCache).evict(id);
    }

    @Test
    void updateBlocksSuspendingSelf() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(admin(id)));
        AdminUserRequest suspend = new AdminUserRequest("ops1", "Op One", "9999999999", null, AssociateStatus.SUSPENDED, null);
        assertThatThrownBy(() -> service.update(id, suspend, id, AssociateRole.ADMIN)).hasMessageContaining("suspend");
    }

    @Test
    void resetPasswordIssuesNewTemporaryPasswordAndForcesChange() {
        UUID id = UUID.randomUUID();
        Associate a = admin(id);
        a.setPasswordHash("old");
        when(repository.findById(id)).thenReturn(Optional.of(a));
        AdminUserResponse response = service.resetPassword(id, ACTOR, AssociateRole.ADMIN);
        assertThat(response.temporaryPassword()).isNotBlank();
        assertThat(a.getPasswordHash()).isNotEqualTo("old");
        assertThat(a.isMustChangePassword()).isTrue();
    }

    @Test
    void adminListsAdminsAndManagersManagerListsOnlyManagers() {
        service.list(AssociateRole.ADMIN);
        verify(repository).findByRoleInOrderByUserIdAsc(Set.of(AssociateRole.ADMIN, AssociateRole.MANAGER));
        service.list(AssociateRole.MANAGER);
        verify(repository).findByRoleInOrderByUserIdAsc(Set.of(AssociateRole.MANAGER));
    }

    @Test
    void managerGetsNotFoundForAnyAdminRow() {
        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(admin(id)));
        AdminUserRequest edit = new AdminUserRequest("ops1", "Op One", "9999999999", null, null, null);
        assertThatThrownBy(() -> service.update(id, edit, ACTOR, AssociateRole.MANAGER)).hasMessageContaining("not found");
        assertThatThrownBy(() -> service.resetPassword(id, ACTOR, AssociateRole.MANAGER)).hasMessageContaining("not found");
        assertThatThrownBy(() -> service.delete(id, ACTOR, AssociateRole.MANAGER)).hasMessageContaining("not found");
        verify(repository, never()).save(any());
        verify(repository, never()).delete(any());
    }

    @Test
    void managerCannotCreateAnAdmin() {
        AdminUserRequest asAdmin = new AdminUserRequest("ops1", "Op One", "9999999999", null, null, AssociateRole.ADMIN);
        assertThatThrownBy(() -> service.create(asAdmin, ACTOR, AssociateRole.MANAGER))
            .isInstanceOf(AdminUserException.class).hasMessageContaining("cannot create");
        verify(repository, never()).save(any());
    }

    @Test
    void managerCreatesManagerByDefaultAuditedUnderManagerUsers() {
        service.create(request("mgr1"), ACTOR, AssociateRole.MANAGER);
        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getRole()).isEqualTo(AssociateRole.MANAGER);
        ArgumentCaptor<SettingsAuditLog> audit = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(auditLogRepository).save(audit.capture());
        assertThat(audit.getValue().getSection()).isEqualTo("MANAGER_USERS");
    }

    @Test
    void adminCanCreateManagerAndCanEditManagerRows() {
        AdminUserRequest asManager = new AdminUserRequest("mgr1", "Mgr", "9999999999", null, null, AssociateRole.MANAGER);
        AdminUserResponse created = service.create(asManager, ACTOR, AssociateRole.ADMIN);
        assertThat(created.role()).isEqualTo(AssociateRole.MANAGER);

        UUID id = UUID.randomUUID();
        when(repository.findById(id)).thenReturn(Optional.of(user(id, AssociateRole.MANAGER)));
        assertThat(service.resetPassword(id, ACTOR, AssociateRole.ADMIN).temporaryPassword()).isNotBlank();
    }
}
