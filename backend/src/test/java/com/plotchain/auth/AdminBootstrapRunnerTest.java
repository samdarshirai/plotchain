package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminBootstrapRunnerTest {

    @Mock AssociateRepository associateRepository;
    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    void createsTheFirstAdminWhenTheTableIsEmpty() throws Exception {
        when(associateRepository.count()).thenReturn(0L);
        AdminBootstrapRunner runner = new AdminBootstrapRunner(
            associateRepository, passwordEncoder, "boss@example.com", "s3cret-password");

        runner.run(null);

        ArgumentCaptor<Associate> saved = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(saved.capture());
        Associate admin = saved.getValue();
        assertThat(admin.getEmail()).isEqualTo("boss@example.com");
        assertThat(admin.getRole()).isEqualTo(AssociateRole.ADMIN);
        assertThat(admin.getRankId()).isNull();
        assertThat(admin.isMustChangePassword()).isTrue();
        assertThat(admin.getPasswordHash()).isNotEqualTo("s3cret-password");
        assertThat(passwordEncoder.matches("s3cret-password", admin.getPasswordHash())).isTrue();
    }

    @Test
    void doesNothingWhenAssociatesAlreadyExist() throws Exception {
        when(associateRepository.count()).thenReturn(5L);
        AdminBootstrapRunner runner = new AdminBootstrapRunner(
            associateRepository, passwordEncoder, "boss@example.com", "s3cret-password");

        runner.run(null);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void doesNothingWhenCredentialsAreNotConfigured() throws Exception {
        AdminBootstrapRunner runner = new AdminBootstrapRunner(
            associateRepository, passwordEncoder, "", "");

        runner.run(null);

        verify(associateRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(associateRepository, never()).count();
    }
}
